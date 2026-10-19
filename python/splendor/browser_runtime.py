"""Browser-side rules and NumPy inference. No server, torch, or trusted pickle."""
from copy import deepcopy
from datetime import datetime, timezone
import secrets
from urllib.parse import urlsplit, parse_qs
import numpy as np
from .env import SplendorEnv
from .rl.features import encode


class NumpyPolicy:
    def __init__(self,data):
        self.feature_version=data['feature_version']
        self.w={k:np.asarray(v,dtype=np.float32) for k,v in data['weights'].items()}

    def forward(self,state,candidates):
        x=np.concatenate([np.broadcast_to(state,(len(candidates),len(state))),candidates],axis=1)
        for layer in (0,2,4):
            x=x@self.w[f'actor.{layer}.weight'].T+self.w[f'actor.{layer}.bias']
            if layer!=4: x=np.tanh(x)
        v=state
        for layer in (0,2):
            v=v@self.w[f'critic.{layer}.weight'].T+self.w[f'critic.{layer}.bias']
            if layer==0: v=np.tanh(v)
        return x[:,0],float(v[0])

    def choose(self,state,candidates,rng):
        logits,value=self.forward(state,candidates)
        probs=np.exp(logits.astype(np.float64)-float(logits.max())); probs/=probs.sum()
        i=int(rng.choice(len(probs),p=probs))
        return i,float(probs[i]),value


class BrowserGame:
    def __init__(self,model):
        self.model=model; self.policy=NumpyPolicy(model); self.env=None; self.version=0
        self.record=None; self.human=0; self.rng=None

    def snapshot(self,player=None):
        if self.env is None:return dict(version=self.version,state=None,info=None)
        if player is not None and player!=self.human:raise ValueError('只能查看自己的私人视角')
        return dict(version=self.version,state=self.env.observe(player),info=self.env.info(),
                    human_seat=self.human,model_name=self.model['model_name'],game_id=self.record['game_id'])

    def save(self):
        return dict(record=self.record,version=self.version,rng=self.rng.bit_generator.state if self.rng else None,
                    model_sha256=self.model['sha256'])

    def restore(self,saved):
        if not saved.get('record'):return
        if saved.get('model_sha256')!=self.model['sha256']:raise ValueError('模型已更新，旧记录可回放，请新建对局')
        r=saved['record']; env=SplendorEnv();env.reset(r['seed'],r['num_players'])
        for event in r['events']:env.step(event['action'])
        self.env=env;self.record=r;self.human=r['human_seat'];self.version=saved['version']
        self.rng=np.random.default_rng();self.rng.bit_generator.state=saved['rng']

    def execute(self,action,controller,probability=None):
        s=self.env.engine.state
        event=dict(step=len(self.record['events'])+1,at=datetime.now(timezone.utc).isoformat(),
                   round=s.round,phase=s.phase,player=s.current_player,controller=controller,
                   action=deepcopy(action),policy_probability=probability)
        self.env.step(action);self.version+=1
        event['public_state']=self.env.public_observation();self.record['events'].append(event)
        self.record.update(final_state=event['public_state'],finished=self.env.terminated,
                           termination_reason=self.env.info()['termination_reason'])

    def model_turn(self):
        for _ in range(16):
            if self.env.terminated or self.env.engine.state.current_player==self.human:return
            actions=self.env.legal_actions()
            if not actions:return
            s,a=encode(self.env.observe(self.env.engine.state.current_player),actions,version=self.policy.feature_version)
            i,p,_=self.policy.choose(s,a,self.rng);self.execute(actions[i],'model',p)
        raise ValueError('模型子动作数量异常')

    def request(self,path,body=None):
        url=urlsplit(path); q=parse_qs(url.query)
        player=int(q['player_id'][0]) if 'player_id' in q else None
        if url.path=='/api/state':return self.snapshot(player)
        if url.path=='/api/checkpoints':return dict(best=dict(path=self.model['model_name']),checkpoints=[])
        if url.path=='/api/record':
            if not self.record:raise ValueError('请先创建对局')
            return self.record
        if body is not None and body.get('version')!=self.version:raise ValueError('对局版本已更新，请刷新重试')
        if url.path=='/api/new':
            n=body.get('num_players',2); human=body.get('human_seat',0);seed=body.get('seed')
            if type(n)!=int or not 2<=n<=4 or type(human)!=int or not 0<=human<n:raise ValueError('请选择有效人数和席位')
            if n>2 and self.policy.feature_version<3:raise ValueError('该模型只支持双人')
            if seed is None:seed=secrets.randbelow(2**31)
            if type(seed)!=int or not 0<=seed<=2**53-1:raise ValueError('种子无效')
            env=SplendorEnv();env.reset(seed,n)
            self.env=env;self.human=human;self.rng=np.random.default_rng(seed+20000000);self.version+=1
            self.record=dict(game_id=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'_'+secrets.token_hex(4),
                 seed=seed,num_players=n,human_seat=human,checkpoint=self.model['model_name'],
                 feature_version=self.policy.feature_version,model_sha256=self.model['sha256'],
                 initial_state=env.public_observation(),events=[],final_state=env.public_observation(),finished=False,termination_reason=None)
            self.model_turn();return self.snapshot()
        if self.env is None:raise ValueError('请先创建对局')
        if url.path=='/api/actions':
            if player!=self.human:raise ValueError('AI席位由浏览器自动执行')
            return dict(version=self.version,actions=self.env.legal_actions())
        if url.path=='/api/action':
            if body['player_id']!=self.human or self.env.engine.state.current_player!=self.human:raise ValueError('尚未轮到你')
            self.execute(body['action'],'human');self.model_turn();return self.snapshot()
        raise ValueError('不支持的浏览器接口')
