"""Resource policy for the data-only Flashscore browser session."""

BLOCKED_RESOURCE_TYPES = frozenset({"image", "media", "font"})


def should_abort_browser_resource(resource_type):
    return resource_type in BLOCKED_RESOURCE_TYPES
