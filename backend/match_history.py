from __future__ import annotations

import json
import os
import uuid
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

import psycopg

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres@127.0.0.1:54329/yichui")
_DATA_DIR = Path(__file__).resolve().parent / "data" / "matches"

MIN_MATCHES_FOR_RATE = 1
MIN_ROUNDS_FOR_RATE = 1


def _connect():
    return psycopg.connect(DATABASE_URL)


def init_database() -> None:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                create table if not exists namebattle_matches (
                  id text primary key,
                  user_id text references users(id) on delete set null,
                  created_at timestamptz not null,
                  mode text not null,
                  protagonist jsonb not null,
                  antagonist jsonb not null,
                  rounds jsonb not null,
                  final_score jsonb not null,
                  champion text not null,
                  champion_name text not null,
                  raw_payload jsonb not null,
                  updated_at timestamptz not null default now()
                );
                """
            )
        conn.commit()
    _seed_from_files()


def _seed_from_files() -> None:
    if not _DATA_DIR.exists():
        return
    for path in _DATA_DIR.glob("*.json"):
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
            _upsert_record(record)
        except (OSError, json.JSONDecodeError):
            continue


def _record_from_payload(payload: dict[str, Any], match_id: str | None = None) -> dict[str, Any]:
    record_id = match_id or uuid.uuid4().hex[:12]
    created_at = payload.get("created_at") or datetime.now().isoformat(timespec="seconds")
    return {
        "id": record_id,
        "created_at": created_at,
        "mode": str(payload.get("mode") or "story"),
        "protagonist": payload.get("protagonist") or {},
        "antagonist": payload.get("antagonist") or {},
        "rounds": payload.get("rounds") or [],
        "final_score": payload.get("final_score") or {"protagonist": 0, "antagonist": 0},
        "champion": str(payload.get("champion") or ""),
        "champion_name": str(payload.get("champion_name") or ""),
    }


def _upsert_record(record: dict[str, Any], user_id: str | None = None) -> None:
    rec = _record_from_payload(record, record.get("id") or None)
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into namebattle_matches
                  (id, user_id, created_at, mode, protagonist, antagonist, rounds, final_score, champion, champion_name, raw_payload)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (id) do update set
                  user_id = coalesce(excluded.user_id, namebattle_matches.user_id),
                  created_at = excluded.created_at,
                  mode = excluded.mode,
                  protagonist = excluded.protagonist,
                  antagonist = excluded.antagonist,
                  rounds = excluded.rounds,
                  final_score = excluded.final_score,
                  champion = excluded.champion,
                  champion_name = excluded.champion_name,
                  raw_payload = excluded.raw_payload,
                  updated_at = now()
                """,
                (
                    rec["id"],
                    user_id,
                    rec["created_at"],
                    rec["mode"],
                    json.dumps(rec["protagonist"], ensure_ascii=False),
                    json.dumps(rec["antagonist"], ensure_ascii=False),
                    json.dumps(rec["rounds"], ensure_ascii=False),
                    json.dumps(rec["final_score"], ensure_ascii=False),
                    rec["champion"],
                    rec["champion_name"],
                    json.dumps(rec, ensure_ascii=False),
                ),
            )
        conn.commit()


def save_match(payload: dict[str, Any], user_id: str | None = None) -> str:
    match_id = uuid.uuid4().hex[:12]
    _upsert_record(_record_from_payload(payload, match_id), user_id)
    return match_id


def _load_all(user_id: str | None = None) -> list[dict[str, Any]]:
    with _connect() as conn:
        with conn.cursor() as cur:
            if user_id:
                cur.execute(
                    """
                    select id, created_at, mode, protagonist, antagonist, rounds, final_score, champion, champion_name
                    from namebattle_matches
                    where user_id = %s
                    order by created_at desc
                    """,
                    (user_id,),
                )
            else:
                cur.execute(
                    """
                    select id, created_at, mode, protagonist, antagonist, rounds, final_score, champion, champion_name
                    from namebattle_matches
                    order by created_at desc
                    """
                )
            rows = cur.fetchall()
    return [
        {
            "id": row[0],
            "created_at": row[1].isoformat() if hasattr(row[1], "isoformat") else str(row[1]),
            "mode": row[2],
            "protagonist": row[3] or {},
            "antagonist": row[4] or {},
            "rounds": row[5] or [],
            "final_score": row[6] or {"protagonist": 0, "antagonist": 0},
            "champion": row[7],
            "champion_name": row[8],
        }
        for row in rows
    ]


def list_matches(user_id: str | None = None) -> list[dict[str, Any]]:
    return [
        {
            "id": r.get("id", ""),
            "created_at": r.get("created_at", ""),
            "mode": r.get("mode", ""),
            "protagonist_name": (r.get("protagonist") or {}).get("name", ""),
            "antagonist_name": (r.get("antagonist") or {}).get("name", ""),
            "champion_name": r.get("champion_name", ""),
            "final_score": r.get("final_score", {"protagonist": 0, "antagonist": 0}),
        }
        for r in _load_all(user_id)
    ]


def get_match(match_id: str, user_id: str | None = None) -> dict[str, Any] | None:
    with _connect() as conn:
        with conn.cursor() as cur:
            if user_id:
                cur.execute(
                    """
                    select id, created_at, mode, protagonist, antagonist, rounds, final_score, champion, champion_name
                    from namebattle_matches
                    where id = %s and user_id = %s
                    """,
                    (match_id, user_id),
                )
            else:
                cur.execute(
                    """
                    select id, created_at, mode, protagonist, antagonist, rounds, final_score, champion, champion_name
                    from namebattle_matches
                    where id = %s
                    """,
                    (match_id,),
                )
            row = cur.fetchone()
    if not row:
        return None
    return {
        "id": row[0],
        "created_at": row[1].isoformat() if hasattr(row[1], "isoformat") else str(row[1]),
        "mode": row[2],
        "protagonist": row[3] or {},
        "antagonist": row[4] or {},
        "rounds": row[5] or [],
        "final_score": row[6] or {"protagonist": 0, "antagonist": 0},
        "champion": row[7],
        "champion_name": row[8],
    }


def delete_match(match_id: str, user_id: str | None = None) -> bool:
    with _connect() as conn:
        with conn.cursor() as cur:
            if user_id:
                cur.execute("delete from namebattle_matches where id = %s and user_id = %s", (match_id, user_id))
            else:
                cur.execute("delete from namebattle_matches where id = %s", (match_id,))
            deleted = cur.rowcount > 0
        conn.commit()
    return deleted


def _empty_stat() -> dict[str, Any]:
    return {
        "name": "",
        "source": "",
        "summary": "",
        "matches_played": 0,
        "matches_won": 0,
        "rounds_played": 0,
        "rounds_won": 0,
    }


def _accumulate(stats: dict[str, dict[str, Any]], rec: dict[str, Any], side: str) -> None:
    role = rec.get(side) or {}
    name = (role.get("name") or "").strip()
    if not name:
        return
    s = stats[name]
    s["name"] = name
    if role.get("source"):
        s["source"] = role["source"]
    if role.get("summary"):
        s["summary"] = role["summary"]
    s["matches_played"] += 1
    if rec.get("champion") == side:
        s["matches_won"] += 1
    for item in rec.get("rounds") or []:
        s["rounds_played"] += 1
        if item.get("winner") == side:
            s["rounds_won"] += 1


def _aggregate() -> list[dict[str, Any]]:
    stats: dict[str, dict[str, Any]] = defaultdict(_empty_stat)
    for rec in sorted(_load_all(), key=lambda r: r.get("created_at", "")):
        _accumulate(stats, rec, "protagonist")
        _accumulate(stats, rec, "antagonist")
    return list(stats.values())


def _with_rates(stats: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for stat in stats:
        item = dict(stat)
        mp = stat["matches_played"]
        rp = stat["rounds_played"]
        item["match_rate"] = (stat["matches_won"] / mp) if mp else 0.0
        item["round_rate"] = (stat["rounds_won"] / rp) if rp else 0.0
        out.append(item)
    return out


def get_leaderboards() -> dict[str, list[dict[str, Any]]]:
    all_stats = _with_rates(_aggregate())
    match_rate = sorted(
        (s for s in all_stats if s["matches_played"] >= MIN_MATCHES_FOR_RATE),
        key=lambda s: (-s["match_rate"], -s["matches_won"], -s["matches_played"]),
    )
    round_rate = sorted(
        (s for s in all_stats if s["rounds_played"] >= MIN_ROUNDS_FOR_RATE),
        key=lambda s: (-s["round_rate"], -s["rounds_won"], -s["rounds_played"]),
    )
    match_wins = sorted(all_stats, key=lambda s: (-s["matches_won"], -s["match_rate"]))
    round_wins = sorted(all_stats, key=lambda s: (-s["rounds_won"], -s["round_rate"]))
    return {
        "match_rate": match_rate,
        "round_rate": round_rate,
        "match_wins": match_wins,
        "round_wins": round_wins,
    }


def get_character_profile(name: str) -> dict[str, Any] | None:
    name = (name or "").strip()
    if not name:
        return None

    matches: list[dict[str, Any]] = []
    source = summary = ""
    mp = mw = rp = rw = 0

    for rec in sorted(_load_all(), key=lambda r: r.get("created_at", "")):
        pro = rec.get("protagonist") or {}
        ant = rec.get("antagonist") or {}
        is_pro = (pro.get("name") or "") == name
        is_ant = (ant.get("name") or "") == name
        if not is_pro and not is_ant:
            continue
        side = "protagonist" if is_pro else "antagonist"
        opp_side = "antagonist" if is_pro else "protagonist"
        me = pro if is_pro else ant
        opp = ant if is_pro else pro
        source = me.get("source") or source
        summary = me.get("summary") or summary
        final_score = rec.get("final_score") or {}
        won = rec.get("champion") == side
        mp += 1
        mw += 1 if won else 0
        rcnt = rwon = 0
        for round_item in rec.get("rounds") or []:
            rp += 1
            rcnt += 1
            if round_item.get("winner") == side:
                rw += 1
                rwon += 1
        matches.append({
            "id": rec.get("id", ""),
            "created_at": rec.get("created_at", ""),
            "mode": rec.get("mode", ""),
            "opponent_name": opp.get("name", ""),
            "side": side,
            "won": won,
            "my_score": int(final_score.get(side, 0)),
            "opponent_score": int(final_score.get(opp_side, 0)),
            "rounds": rcnt,
            "rounds_won_in_match": rwon,
        })

    if mp == 0:
        return None
    matches.sort(key=lambda item: item["created_at"], reverse=True)
    return {
        "name": name,
        "source": source,
        "summary": summary,
        "matches_played": mp,
        "matches_won": mw,
        "rounds_played": rp,
        "rounds_won": rw,
        "match_rate": (mw / mp) if mp else 0.0,
        "round_rate": (rw / rp) if rp else 0.0,
        "matches": matches,
    }
