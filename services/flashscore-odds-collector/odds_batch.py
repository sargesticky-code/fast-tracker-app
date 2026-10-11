"""Run a bounded number of odds requests without creating one task per fixture."""
import asyncio


async def bounded_map(items, fetch, concurrency, timeout_seconds):
    """Return results in input order and stop outstanding work at the deadline."""
    results = [None] * len(items)
    next_index = 0
    completed = 0

    async def worker():
        nonlocal next_index, completed
        while next_index < len(items):
            index = next_index
            next_index += 1
            results[index] = await fetch(items[index])
            completed += 1

    workers = [
        asyncio.create_task(worker())
        for _ in range(min(max(1, concurrency), len(items)))
    ]
    if not workers:
        return results, 0, False

    done, pending = await asyncio.wait(workers, timeout=timeout_seconds)
    for task in pending:
        task.cancel()
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)
    for task in done:
        task.result()
    return results, completed, bool(pending)
