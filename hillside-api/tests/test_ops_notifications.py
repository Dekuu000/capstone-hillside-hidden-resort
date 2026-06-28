"""Back-office (ops) notification targeting — the money-event emitters added so
managers are told when a guest pays or when a PAID booking is cancelled, while
Front Desk stays free of payment noise."""

import app.integrations.supabase_client as sc


def _capture(monkeypatch):
    calls: list[dict] = []
    monkeypatch.setattr(sc, "emit_notification_to_roles", lambda **kw: calls.append(kw) or 1)
    return calls


def test_payment_received_notifies_managers_only(monkeypatch) -> None:
    calls = _capture(monkeypatch)
    sc.notify_ops_payment_received(
        reservation={"reservation_id": "r1", "reservation_code": "HR-PAID"}, amount=500
    )
    assert len(calls) == 1
    assert calls[0]["min_role"] == "admin"  # managers + system admin, NOT front desk
    assert calls[0]["event_type"] == "ops.payment_received"
    assert "HR-PAID" in calls[0]["body"]


def test_paid_cancellation_distinguishes_refund_and_forfeit(monkeypatch) -> None:
    calls = _capture(monkeypatch)
    sc.notify_ops_paid_cancellation(
        reservation={"reservation_id": "r1", "reservation_code": "HR-REF"}, outcome="refunded", amount=900
    )
    sc.notify_ops_paid_cancellation(
        reservation={"reservation_id": "r2", "reservation_code": "HR-FOR"}, outcome="forfeited", amount=500
    )
    assert [c["min_role"] for c in calls] == ["admin", "admin"]
    assert "refund" in calls[0]["title"].lower()
    assert "cancelled" in calls[1]["title"].lower()


def test_ops_emitters_are_defensive_on_bad_input(monkeypatch) -> None:
    calls = _capture(monkeypatch)
    sc.notify_ops_payment_received(reservation=None)
    sc.notify_ops_paid_cancellation(reservation=None, outcome="refunded")
    assert calls == []
