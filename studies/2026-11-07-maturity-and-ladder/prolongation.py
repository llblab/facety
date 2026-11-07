"""Closed-form and Monte Carlo bound on how long an adversary can hold an accused person in one dispute (D158, D159, D161, D162).

The adversary owns m accounts with strictly increasing XP and enough liquid FACY, enters each position in the last hour before the
shared deadline (the strongest timing) and never loses the XP condition. Council attention is a per-day probability once the dispute has
two positions; the Council entry is terminal (D69, D161). Standard library only; run `python3 prolongation.py`.
"""
import random


def window(n):
    return max(3, 8 - n)


def stake(n, base=7):
    return -(-base * 6 ** (n - 1) // 5 ** (n - 1))


def duration(m):
    deadline, locked = 7.0, stake(1)
    for n in range(2, m + 2):
        join = deadline - 1 / 24
        deadline = max(deadline, join + window(n))
        locked += stake(n)
    return deadline, stake(m + 1), locked


def with_council(q, m, trials=20000):
    runs = []
    for _ in range(trials):
        deadline, pos, t, entered = 7.0, 1, 0.0, False
        while pos - 1 < m:
            last_hour = deadline - 1 / 24
            if pos >= 2 and any(random.random() < q for _ in range(int(last_hour - t))):
                entered = True
                break
            t, pos = last_hour, pos + 1
            deadline = max(deadline, t + window(pos))
        if entered:
            deadline = max(deadline, t + 1 + window(pos + 1))
        runs.append(deadline)
    runs.sort()
    return sum(runs) / len(runs), runs[int(0.95 * len(runs))]


if __name__ == "__main__":
    random.seed(1)
    print("m | days held (no Council) | stake of the last position | FACY locked in all positions")
    for m in (1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25):
        d, s, locked = duration(m)
        print(m, round(d, 1), s, locked)
    print("Council attention q per day once contested: mean / 95th percentile days held")
    for q in (0, 0.1, 0.3, 0.5):
        print(q, ["m=%d: %.1f/%.1f" % ((m,) + with_council(q, m)) for m in (3, 6, 10, 20)])
