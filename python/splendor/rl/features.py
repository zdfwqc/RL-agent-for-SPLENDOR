"""Observable-only features; no engine state, card catalogue or hidden IDs.

Domain knowledge is explicit: card affordability and noble distance are supplied
as features. Action scores themselves are learned, not hard-coded into PPO.
"""
import numpy as np

STATE_DIM = 42
ACTION_DIM = 38
FEATURE_VERSION = 1
KINDS = ('take', 'buy', 'reserve', 'discard', 'noble')
DIMENSIONS = {1: (42, 38), 2: (255, 54), 3: (305, 59)}


def encode(obs, actions, version=1):
    if version not in DIMENSIONS:
        raise ValueError('Unsupported feature version')
    if version < 3 and len(obs['players']) != 2:
        raise ValueError('This trained policy supports two players only')
    if not 2 <= len(obs['players']) <= 4:
        raise ValueError('Expected 2 to 4 players')
    seat = obs['current_player']
    me, other = obs['players'][seat], obs['players'][(seat+1)%len(obs['players'])]
    state = []
    for p in (me, other):
        state += [v/5 for v in p['tokens']] + [v/8 for v in p['bonuses']]
        state += [p['points']/15, p['reserved_count']/3, len(p['purchased'])/20]
    state += [v/5 for v in obs['bank']] + [v/40 for v in obs['deck_counts']]
    state += [float(obs['phase'] == k) for k in ('main', 'discard', 'noble')]
    state += [float(obs['final_round']), min(obs['round']/100, 2)]
    cards = [c for row in obs['market'] for c in row if c] + me.get('reserved', [])
    lookup = {c['id']: c for c in cards}
    costs = np.array([c['cost'] for c in cards], dtype=np.float32).reshape(-1, 5)
    tokens = np.array(me['tokens'], dtype=np.float32)
    bonuses = np.array(me['bonuses'], dtype=np.float32)
    noble_costs = np.array([n['cost'] for n in obs['nobles']], dtype=np.float32).reshape(-1, 5)

    def distances(t, b):
        return np.maximum(np.maximum(costs-b-t[:5], 0).sum(axis=1)-t[5], 0)

    before = distances(tokens, bonuses)
    rows = []
    for action in actions:
        kind = action['type']
        t, b = tokens.copy(), bonuses.copy()
        c = lookup.get(action.get('card_id'))
        point = 0
        if kind == 'take':
            t[:5] += action['tokens']
        elif kind == 'discard':
            t -= action['tokens']
        elif kind == 'reserve':
            t[5] += int(obs['bank'][5] > 0)
        elif kind == 'buy':
            t -= action['payment']
            b[c['bonus']] += 1
            point = c['points']
        elif kind == 'noble':
            point = 3
        after = distances(t, b)
        keep = np.array([not (kind == 'buy' and x['id'] == c['id']) for x in cards], dtype=bool)
        d0, d1 = before[keep], after[keep]
        # Features describe the immediate candidate and observable opportunities.
        row = [float(kind == k) for k in KINDS]
        row += list((t-tokens)/3)
        row += [point/5, (c['tier'] if c else action.get('tier', 0))/3]
        row += [float(c is not None and c['bonus'] == i) for i in range(5)]
        row += [v/7 for v in c['cost']] if c else [0.] * 5
        row += [max(float(t.sum())-10, 0)/3, t[5]/5]
        row += [(float(d0.min())-float(d1.min()))/3 if len(d0) else 0,
                float((d0-d1).mean())/3 if len(d0) else 0,
                float((d1 == 0).sum())/15,
                float((d1 <= 2).sum())/15]
        row += [float(np.maximum(noble_costs-bonuses, 0).sum()-np.maximum(noble_costs-b, 0).sum())/3]
        row += [float(kind == 'buy' and me['points']+point >= 15),
                float(kind == 'reserve' and 'tier' in action),
                (max(float(np.maximum(np.array(c['cost'])-bonuses-tokens[:5], 0).sum()-tokens[5]), 0)/10) if c else 0,
                (other['points']/15)*point/5,
                (1-min(me['points']/15, 1))*float(kind == 'buy'),
                float(kind == 'buy' and c['id'] in {x['id'] for x in me.get('reserved', [])}),
                float(kind == 'buy')*sum(action.get('payment', []))/10,
                float(kind == 'take')*sum(action.get('tokens', []))/3]
        rows.append(row)
    s, a = np.asarray(state, dtype=np.float32), np.asarray(rows, dtype=np.float32)
    assert s.shape == (STATE_DIM,) and a.shape == (len(actions), ACTION_DIM), (s.shape, a.shape)
    if version >= 2:
        s, a = extend_features(obs, actions, s, a, noble_slots=5 if version==3 else 3)
    if version == 3:
        n=len(obs['players'])
        opponents=[obs['players'][(seat+i)%n] for i in range(1,n)]
        extra=[]
        for i in (1,2):
            p=opponents[i] if i<len(opponents) else None
            extra += ([v/5 for v in p['tokens']]+[v/8 for v in p['bonuses']]
                      +[p['points']/15,p['reserved_count']/3,len(p['purchased'])/20]) if p else [0.]*14
        extra += [float(i<n-1) for i in range(3)]
        extra += [float(n==i) for i in (2,3,4)]+[float(seat==i) for i in range(4)]
        risk=[]
        for action in actions:
            c=lookup.get(action.get('card_id')); row=[]
            for i in range(3):
                if c and i<len(opponents):
                    p=opponents[i]
                    gap=max(float(np.maximum(np.array(c['cost'])-np.array(p['bonuses'])-np.array(p['tokens'][:5]),0).sum())-p['tokens'][5],0.)
                    row.append(gap/10)
                else: row.append(0.)
            risk.append(row)
        s=np.concatenate([s,np.array(extra,dtype=np.float32)])
        a=np.concatenate([a,np.array(risk,dtype=np.float32)],axis=1)
        assert s.shape==(305,) and a.shape==(len(actions),59)
    return s, a


def extend_features(obs, actions, state, candidates, noble_slots=3):
    seat=obs['current_player']
    me, opponent = obs['players'][seat], obs['players'][(seat+1)%len(obs['players'])]
    visible = [c for row in obs['market'] for c in row] + me.get('reserved', [])
    visible += [None]*(15-len(visible))
    extra = []
    for c in visible:
        extra += ([1., c['tier']/3] + [float(c['bonus']==i) for i in range(5)]
                  + [c['points']/5] + [v/7 for v in c['cost']]) if c else [0.]*13
    for n in obs['nobles']:
        extra += [1.] + [v/4 for v in n['cost']]
    extra += [0.]*(6*(noble_slots-len(obs['nobles'])))
    lookup = {c['id']:c for c in visible if c}
    noble_lookup = {n['id']:n for n in obs['nobles']}
    nc = np.array([n['cost'] for n in obs['nobles']], dtype=np.float32).reshape(-1,5)
    bonuses = np.array(me['bonuses'], dtype=np.float32)
    old_def = np.maximum(nc-bonuses, 0).sum(axis=1)
    rows = []
    for action in actions:
        kind, c = action['type'], lookup.get(action.get('card_id'))
        b = bonuses.copy()
        if kind == 'buy':
            b[c['bonus']] += 1
        deficit = np.maximum(nc-b, 0).sum(axis=1)
        awarded = bool(len(deficit) and deficit.min()==0 and kind in ('take','buy','reserve','discard'))
        noble = noble_lookup.get(action.get('noble_id'))
        row = [v/4 for v in noble['cost']] if noble else [0.]*5
        row += [float(deficit.min())/12 if len(deficit) else 1.,
                float(((deficit==0)&(old_def>0)).sum())/3, float(awarded),
                float(me['points']+(c['points'] if kind=='buy' else 0)+3*awarded>=15)]
        row += list(np.pad(np.sort(deficit)/12, (0,noble_slots-len(deficit)), constant_values=1))
        own_cost = float(np.maximum(np.array(c['cost'])-bonuses,0).sum()) if c else 0.
        opp_gap = max(float(np.maximum(np.array(c['cost'])-np.array(opponent['bonuses'])-np.array(opponent['tokens'][:5]),0).sum())-opponent['tokens'][5],0.) if c else 0.
        row += [own_cost/10, opp_gap/10, float(c is not None and opp_gap==0),
                c['points']/(5*(1+own_cost)) if c else 0.]
        rows.append(row)
    result = (np.concatenate([state, np.asarray(extra,dtype=np.float32)]),
              np.concatenate([candidates,np.asarray(rows,dtype=np.float32)],axis=1))
    assert result[0].shape==(237+6*noble_slots,) and result[1].shape==(len(actions),51+noble_slots)
    return result


def heuristic_scores(features):
    """Independent, documented handcrafted baseline, never an actor logit prior."""
    x = features
    return (2*x[:, 1] + 8*x[:, 11] + 20*x[:, 30] + x[:, 29]
            + 2*x[:, 25] + 3*x[:, 26] + 2*x[:, 27]
            - 3*x[:, 23] - .6*x[:, 2] - x[:, 31]
            - .2*x[:, 36] + .4*x[:, 37] + .4*x[:, 10])
