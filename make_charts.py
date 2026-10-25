"""Locust CSV нәтижелерінен графиктер жасайды: python load-test/make_charts.py"""
import csv, os, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

PFX = sys.argv[1] if len(sys.argv) > 1 else "qr"
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
rows = [r for r in csv.DictReader(open(os.path.join(D, PFX + "_stats_history.csv"), encoding="utf-8")) if r["Name"] == "Aggregated" and r["User Count"] not in ("", "0")]
f = lambda r, k: float(r[k]) if r[k] not in ("", "N/A") else 0.0
t0 = f(rows[0], "Timestamp")
x = [f(r, "Timestamp") - t0 for r in rows]
users = [f(r, "User Count") for r in rows]

def save(fig, name):
    fig.tight_layout(); fig.savefig(os.path.join(D, name), dpi=130); plt.close(fig)

def with_users(ax):
    ax2 = ax.twinx(); ax2.step(x, users, color="gray", alpha=.5, label="Қолданушылар"); ax2.set_ylabel("Виртуалды қолданушылар")
    h1, l1 = ax.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels(); ax.legend(h1 + h2, l1 + l2, loc="upper left"); ax.grid(alpha=.3)

fig, ax = plt.subplots(figsize=(9, 4.2))
ax.plot(x, [f(r, "50%") for r in rows], label="Медиана (50%)")
ax.plot(x, [f(r, "95%") for r in rows], label="95-перцентиль")
ax.set_xlabel("Уақыт, с"); ax.set_ylabel("Жауап уақыты, мс"); ax.set_title("Жауап уақыты (Response Time)")
with_users(ax); save(fig, PFX + "_chart_response_time.png")

fig, ax = plt.subplots(figsize=(9, 4.2))
ax.plot(x, [f(r, "Requests/s") for r in rows], color="tab:green", label="Сұраныс/с (RPS)")
ax.plot(x, [f(r, "Failures/s") for r in rows], color="tab:red", label="Қате/с")
ax.set_xlabel("Уақыт, с"); ax.set_ylabel("Сұраныс/с"); ax.set_title("Өткізу қабілеті (Requests per second)")
with_users(ax); save(fig, PFX + "_chart_rps.png")

stages = sorted(set(users)); xs, med, p95, rps = [], [], [], []
for u in stages:
    seg = [r for r in rows if f(r, "User Count") == u][-8:]
    if not seg: continue
    xs.append(u); med.append(sum(f(r, "50%") for r in seg) / len(seg)); p95.append(sum(f(r, "95%") for r in seg) / len(seg)); rps.append(sum(f(r, "Requests/s") for r in seg) / len(seg))
fig, ax = plt.subplots(figsize=(9, 4.2))
ax.plot(xs, med, "o-", label="Медиана"); ax.plot(xs, p95, "s-", label="95-перцентиль")
ax.set_xlabel("Виртуалды қолданушылар саны"); ax.set_ylabel("Жауап уақыты, мс"); ax.set_title("Жауап уақыты және қолданушылар саны")
ax2 = ax.twinx(); ax2.plot(xs, rps, "g--", alpha=.6, label="RPS"); ax2.set_ylabel("Сұраныс/с")
h1, l1 = ax.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels(); ax.legend(h1 + h2, l1 + l2, loc="upper left"); ax.grid(alpha=.3)
save(fig, PFX + "_chart_response_vs_users.png")
print("OK:", ", ".join(sorted(n for n in os.listdir(D) if n.endswith(".png"))))
