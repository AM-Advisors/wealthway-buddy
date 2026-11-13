"""Export the investor onboarding guide content to /tmp/iog/content.json."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content import GUIDE, SUPPORT

GUIDE["signin"] = "Sign in at onboard.harmonious.co"

payload = {
    "guides": {"investor": GUIDE},
    "support": SUPPORT,
    "outputs": [["investor", "Harmonious-Investor-Onboarding-Guide.pdf", "Completing your investment"]],
}
os.makedirs("/tmp/iog", exist_ok=True)
with open("/tmp/iog/content.json", "w") as f:
    json.dump(payload, f, indent=1)
print("wrote /tmp/iog/content.json")
