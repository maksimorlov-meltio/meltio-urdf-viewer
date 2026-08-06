# TEMPORARY — proves the boot check still runs when pytest is red.
# Removed in the next commit on this branch.
def test_deliberate_failure():
    assert False, "deliberate: does the boot check still run?"
