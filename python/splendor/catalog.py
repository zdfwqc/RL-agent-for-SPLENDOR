from dataclasses import dataclass
from functools import lru_cache
import json
from pathlib import Path


@dataclass(frozen=True)
class Card:
    id: str
    tier: int
    bonus: int
    points: int
    cost: tuple[int, ...]


@dataclass(frozen=True)
class Noble:
    id: str
    points: int
    cost: tuple[int, ...]


@lru_cache(maxsize=1)
def load_catalog() -> tuple[tuple[Card, ...], tuple[Noble, ...]]:
    base = Path(__file__).parent / 'data'
    def read(name, cls):
        rows = json.loads((base / name).read_text())
        return tuple(cls(**{**row, 'cost': tuple(row['cost'])}) for row in rows)
    cards, nobles = read('cards.json', Card), read('nobles.json', Noble)
    if len(cards) != 90 or len(nobles) != 10:
        raise ValueError('牌库数量错误')
    for items in (cards, nobles):
        if len({x.id for x in items}) != len(items):
            raise ValueError('牌库 ID 重复')
        if any(len(x.cost) != 5 or any(type(v) is not int or v < 0 for v in x.cost) for x in items):
            raise ValueError('牌库费用错误')
    return cards, nobles
