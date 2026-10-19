from itertools import combinations
from .actions import payment_options, discard_options, validate_shape
from .models import new_game, COLOR_NAMES


class Engine:
    def __init__(self, seed: int | None = None, num_players: int = 2):
        self.state = new_game(seed, num_players)

    def eligible_nobles(self):
        s = self.state
        bonuses = s.players[s.current_player].bonuses
        return [n for n in s.nobles if all(bonuses[i] >= n.cost[i] for i in range(5))]

    def legal_actions(self) -> list[dict]:
        s = self.state
        p = s.players[s.current_player]
        if s.phase == 'finished':
            return []
        if s.phase == 'discard':
            return [{'type':'discard','tokens':v} for v in discard_options(p.tokens, sum(p.tokens)-10)]
        if s.phase == 'noble':
            return [{'type':'noble','noble_id':n.id} for n in self.eligible_nobles()]
        actions = []
        available = [i for i in range(5) if s.bank[i] > 0]
        for count in range(1,4):
            for combo in combinations(available, count):
                actions.append({'type':'take','tokens':[int(i in combo) for i in range(5)]})
        for i in range(5):
            if s.bank[i] >= 4:
                actions.append({'type':'take','tokens':[2 if j == i else 0 for j in range(5)]})
        market = [c for row in s.market for c in row if c is not None]
        if len(p.reserved) < 3:
            actions.extend({'type':'reserve','card_id':c.id} for c in market)
            actions.extend({'type':'reserve','tier':i+1} for i, d in enumerate(s.decks) if d)
        bonuses = p.bonuses
        for card in market + p.reserved:
            for payment in payment_options(card.cost, bonuses, p.tokens):
                actions.append({'type':'buy','card_id':card.id,'payment':payment})
        return actions

    def _log(self, text: str):
        s = self.state
        s.log.append({'round':s.round, 'player':s.current_player, 'text':text})

    @staticmethod
    def _token_text(tokens):
        return '、'.join(f'{COLOR_NAMES[i]} ×{n}' for i,n in enumerate(tokens) if n) or '免费'

    def _remove_card(self, card_id):
        s = self.state
        for tier, row in enumerate(s.market):
            for index, card in enumerate(row):
                if card is not None and card.id == card_id:
                    row[index] = s.decks[tier].pop() if s.decks[tier] else None
                    if row[index]:
                        self._log(f'市场补入 {row[index].id}（{tier+1} 级）')
                    return card
        p = s.players[s.current_player]
        card = next(c for c in p.reserved if c.id == card_id)
        p.reserved.remove(card)
        return card

    def apply(self, action: dict) -> None:
        # Validate completely before touching cards, tokens, logs or RNG.
        validate_shape(action)
        if action not in self.legal_actions():
            raise ValueError('当前阶段无法执行该动作，请检查库存、费用与预留上限')
        s = self.state
        p = s.players[s.current_player]
        kind = action['type']
        if kind == 'take':
            for i, n in enumerate(action['tokens']):
                s.bank[i] -= n
                p.tokens[i] += n
            self._log('拿取 ' + self._token_text(action['tokens']))
        elif kind == 'reserve':
            if 'tier' in action:
                card = s.decks[action['tier']-1].pop()
                self._log(f'盲抽预留 {action["tier"]} 级牌（身份隐藏）')
            else:
                card = self._remove_card(action['card_id'])
                self._log(f'预留公开牌 {card.id}')
            p.reserved.append(card)
            if s.bank[5]:
                s.bank[5] -= 1
                p.tokens[5] += 1
                self._log('获得 黄金 ×1')
        elif kind == 'buy':
            card = self._remove_card(action['card_id'])
            for i, n in enumerate(action['payment']):
                p.tokens[i] -= n
                s.bank[i] += n
            p.purchased.append(card)
            self._log(f'购买 {card.id} · 支付 {self._token_text(action["payment"])} · +{card.points} 分')
        elif kind == 'discard':
            for i, n in enumerate(action['tokens']):
                p.tokens[i] -= n
                s.bank[i] += n
            self._log('归还 ' + self._token_text(action['tokens']))
        elif kind == 'noble':
            self._award_noble(next(n for n in s.nobles if n.id == action['noble_id']))
            self._finish_turn()
            return
        if sum(p.tokens) > 10:
            s.phase = 'discard'
            return
        eligible = self.eligible_nobles()
        if len(eligible) > 1:
            s.phase = 'noble'
            return
        if eligible:
            self._award_noble(eligible[0])
        self._finish_turn()

    def _award_noble(self, noble):
        s = self.state
        s.nobles.remove(noble)
        s.players[s.current_player].nobles.append(noble)
        self._log(f'获得贵族 {noble.id} · +3 分')

    def _finish_turn(self):
        s = self.state
        if s.players[s.current_player].points >= 15:
            if not s.final_round:
                self._log('达到 15 分，触发最后一轮')
            s.final_round = True
        if s.current_player == len(s.players)-1 and s.final_round:
            best = max((p.points, -len(p.purchased)) for p in s.players)
            s.winners = [i for i,p in enumerate(s.players) if (p.points,-len(p.purchased)) == best]
            s.phase = 'finished'
            self._log('对局结束 · ' + '、'.join(f'玩家 {i+1}' for i in s.winners) + ' 获胜')
            return
        s.current_player = (s.current_player+1) % len(s.players)
        if s.current_player == 0:
            s.round += 1
        s.phase = 'main'
