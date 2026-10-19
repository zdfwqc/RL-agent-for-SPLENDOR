from dataclasses import asdict
from copy import deepcopy
from .models import GameState


def observe(state: GameState, player_id: int | None, *, include_log: bool = True) -> dict:
    if player_id is not None and (type(player_id) is not int or not 0 <= player_id < len(state.players)):
        raise ValueError('玩家编号无效')
    players = []
    for i, p in enumerate(state.players):
        entry = dict(id=i, tokens=list(p.tokens), bonuses=p.bonuses, points=p.points,
                     purchased=[asdict(c) for c in p.purchased],
                     nobles=[asdict(n) for n in p.nobles], reserved_count=len(p.reserved))
        if i == player_id:
            entry['reserved'] = [asdict(c) for c in p.reserved]
        players.append(entry)
    return dict(current_player=state.current_player, phase=state.phase, round=state.round,
                bank=list(state.bank), market=[[asdict(c) if c else None for c in row] for row in state.market],
                deck_counts=[len(d) for d in state.decks], nobles=[asdict(n) for n in state.nobles],
                players=players, final_round=state.final_round, winners=list(state.winners),
                log=deepcopy(state.log) if include_log else [])
