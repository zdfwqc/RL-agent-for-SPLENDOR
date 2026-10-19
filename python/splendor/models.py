from dataclasses import dataclass, field
from random import Random
from .catalog import Card, Noble, load_catalog

COLORS = ('white', 'blue', 'green', 'red', 'black', 'gold')
COLOR_NAMES = ('白钻', '蓝宝石', '祖母绿', '红宝石', '黑玛瑙', '黄金')


@dataclass
class Player:
    tokens: list[int] = field(default_factory=lambda: [0] * 6)
    purchased: list[Card] = field(default_factory=list)
    reserved: list[Card] = field(default_factory=list)
    nobles: list[Noble] = field(default_factory=list)

    @property
    def bonuses(self) -> list[int]:
        return [sum(c.bonus == i for c in self.purchased) for i in range(5)]

    @property
    def points(self) -> int:
        return sum(c.points for c in self.purchased) + sum(n.points for n in self.nobles)


@dataclass
class GameState:
    bank: list[int]
    decks: list[list[Card]]
    market: list[list[Card | None]]
    nobles: list[Noble]
    players: list[Player]
    rng: Random
    current_player: int = 0
    round: int = 1
    phase: str = 'main'
    final_round: bool = False
    winners: list[int] = field(default_factory=list)
    log: list[dict] = field(default_factory=list)


def new_game(seed: int | None, num_players: int) -> GameState:
    if type(num_players) is not int or num_players not in (2, 3, 4):
        raise ValueError('人数必须是 2、3 或 4')
    if seed is not None and (type(seed) is not int or not 0 <= seed <= 2**53 - 1):
        raise ValueError('种子必须为 0 到 9007199254740991 的整数')
    cards, all_nobles = load_catalog()
    rng = Random(seed)
    decks = [[c for c in cards if c.tier == t] for t in (1, 2, 3)]
    for deck in decks:
        rng.shuffle(deck)
    market = [[deck.pop() for _ in range(4)] for deck in decks]
    nobles = list(all_nobles)
    rng.shuffle(nobles)
    return GameState([ {2: 4, 3: 5, 4: 7}[num_players]] * 5 + [5], decks,
                     market, nobles[:num_players+1], [Player() for _ in range(num_players)], rng)
