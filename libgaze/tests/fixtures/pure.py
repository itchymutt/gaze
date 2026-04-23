"""A pure module. No effects. libgaze should report nothing."""


def add(a: int, b: int) -> int:
    return a + b


def greet(name: str) -> str:
    return f"Hello, {name}"


def summarize(items: list[dict]) -> dict:
    total = sum(item["price"] * item["quantity"] for item in items)
    count = sum(item["quantity"] for item in items)
    return {"total": total, "count": count}
