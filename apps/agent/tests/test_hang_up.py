import asyncio

from onboard_agent import worker


class FakeCtx:
    def __init__(self, fail=False):
        self.fail = fail
        self.deleted = False
        self.shutdown_reason = None

    def delete_room(self):
        fut = asyncio.get_running_loop().create_future()
        if self.fail:
            fut.set_exception(RuntimeError("no permission"))
        else:
            self.deleted = True
            fut.set_result(None)
        return fut

    def shutdown(self, reason=""):
        self.shutdown_reason = reason


async def test_hang_up_closes_the_room_for_everyone(monkeypatch):
    monkeypatch.setattr(worker, "HANG_UP_DELAY", 0)
    ctx = FakeCtx()
    await worker.hang_up(ctx)
    assert ctx.deleted
    assert ctx.shutdown_reason == "presentation finished"


async def test_hang_up_still_leaves_if_closing_fails(monkeypatch):
    monkeypatch.setattr(worker, "HANG_UP_DELAY", 0)
    ctx = FakeCtx(fail=True)
    await worker.hang_up(ctx)
    assert not ctx.deleted
    assert ctx.shutdown_reason == "presentation finished"
