import os

# Tests never call real models, whatever ai/.env says (env vars win over the file).
os.environ["VISION_PROVIDER"] = "fake"
os.environ["AI_FILTER"] = "none"
os.environ["AI_PLANNER"] = "none"
