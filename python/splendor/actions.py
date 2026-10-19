"""Finite JSON actions; strict types prevent bool/int and float/int aliases."""
from itertools import product


def payment_options(cost, bonuses, tokens) -> list[list[int]]:
    due = [max(0, cost[i] - bonuses[i]) for i in range(5)]
    minimum_gold = sum(max(0, due[i] - tokens[i]) for i in range(5))
    if minimum_gold > tokens[5]:
        return []
    result = []
    for paid in product(*(range(min(tokens[i], due[i]), max(-1, due[i]-tokens[5]-1), -1) for i in range(5))):
        gold = sum(due) - sum(paid)
        if gold <= tokens[5]:
            result.append(list(paid) + [gold])
    return result


def discard_options(tokens: list[int], amount: int) -> list[list[int]]:
    result = []
    def visit(i, left, current):
        if i == 5:
            if 0 <= left <= tokens[5]:
                result.append(current + [left])
            return
        for x in range(min(tokens[i], left) + 1):
            visit(i+1, left-x, current+[x])
    visit(0, amount, [])
    return result


def validate_shape(action: dict) -> None:
    if type(action) is not dict or type(action.get('type')) is not str:
        raise ValueError('动作格式错误')
    kind = action['type']
    schemas = {'take': {'type','tokens'}, 'buy': {'type','card_id','payment'},
               'discard': {'type','tokens'}, 'noble': {'type','noble_id'}}
    if kind == 'reserve':
        expected = {'type','tier'} if 'tier' in action else {'type','card_id'}
    else:
        expected = schemas.get(kind)
    if expected is None or set(action) != expected:
        raise ValueError('动作字段不正确')
    for key in ('tokens', 'payment'):
        if key in action:
            value = action[key]
            size = 5 if kind == 'take' else 6
            if type(value) is not list or len(value) != size or any(type(x) is not int or not 0 <= x <= 10 for x in value):
                raise ValueError('筹码数量必须是正确长度的非负整数数组')
    if 'tier' in action and (type(action['tier']) is not int or action['tier'] not in (1,2,3)):
        raise ValueError('牌堆等级必须为 1、2 或 3')
    for key in ('card_id','noble_id'):
        if key in action and (type(action[key]) is not str or len(action[key]) > 64):
            raise ValueError('卡牌 ID 格式错误')
