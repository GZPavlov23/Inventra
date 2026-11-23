"""The stores set aside for Inventra's demo store, which the model must never learn from.

The demo shows the forecast on real sales. That is only a fair test if the model has never seen
those sales, so these stores are left out of every training run, the final model included.
train.py and export_demo.py both take the list from here, so they can't drift apart.
"""

import numpy as np

# About 45 of the 898 stores: far more than the demo needs, and too few to matter for training.
DEMO_STORE_SHARE = 0.05
# Its own seed, separate from training, so the demo stores stay put if training changes.
DEMO_SEED = 2027


def demo_store_ids(stores: np.ndarray) -> np.ndarray:
    """The ids of the stores set aside, from the store id of every series."""
    unique = np.unique(stores)
    rng = np.random.default_rng(DEMO_SEED)
    return rng.choice(unique, int(len(unique) * DEMO_STORE_SHARE), replace=False)
