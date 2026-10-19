"""Turn-based multi-agent interface; not a single-agent Gymnasium adapter."""
from .engine import Engine
from .observation import observe


class SplendorEnv:
    def __init__(self, max_steps: int | None = None, reward_fn=None):
        if max_steps is not None and (type(max_steps) is not int or max_steps <= 0):
            raise ValueError('步数上限必须是正整数')
        self.max_steps = max_steps
        self.reward_fn = reward_fn
        self.engine = None
        self.steps = 0
        self.terminated = False
        self.truncated = False

    def _require_game(self):
        if self.engine is None:
            raise ValueError('请先调用 reset 创建对局')

    def reset(self, seed=None, num_players=2) -> tuple[dict, dict]:
        engine = Engine(seed, num_players)
        self.engine = engine
        self.steps = 0
        self.terminated = self.truncated = False
        return self.observe(0), self.info()

    def observe(self, player_id: int) -> dict:
        self._require_game()
        return observe(self.engine.state, player_id)

    def public_observation(self) -> dict:
        self._require_game()
        return observe(self.engine.state, None)

    def legal_actions(self) -> list[dict]:
        self._require_game()
        return [] if self.terminated or self.truncated else self.engine.legal_actions()

    def info(self, acting_player=None) -> dict:
        self._require_game()
        s = self.engine.state
        reason = 'finished' if self.terminated else 'max_steps' if self.truncated else None
        if reason is None and not self.engine.legal_actions():
            reason = 'no_legal_actions'
        return dict(acting_player=acting_player, current_player=s.current_player, phase=s.phase,
                    round=s.round, winners=list(s.winners), termination_reason=reason)

    def step(self, action: dict) -> tuple[dict, list[float], bool, bool, dict]:
        self._require_game()
        if self.terminated or self.truncated:
            raise ValueError('对局已结束或已截断，请重新 reset')
        s = self.engine.state
        actor = s.current_player
        self.engine.apply(action)
        self.steps += 1
        self.terminated = s.phase == 'finished'
        self.truncated = not self.terminated and self.max_steps is not None and self.steps >= self.max_steps
        rewards = [0.0] * len(s.players)
        if self.terminated:
            rewards = [float((1 if len(s.winners) == 1 else 0) if i in s.winners else -1) for i in range(len(s.players))]
        if self.reward_fn is not None:
            rewards = list(self.reward_fn(s))
            if len(rewards) != len(s.players):
                raise ValueError('奖励函数须返回每位玩家的奖励')
        return self.observe(s.current_player), rewards, self.terminated, self.truncated, self.info(actor)
