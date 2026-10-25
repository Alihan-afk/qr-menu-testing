"""
QR-Menu жүктемелік тестілеуі (Locust).

Сценарий: қонақ мәзірді қарайды (GET), тапсырыс береді (POST), тапсырысты тексереді (GET)
және төлейді (POST). Жүктеме сатылап артады (LoadTestShape): 10 -> 50 -> 100 -> 200 -> 400 -> 600 қолданушы.

Іске қосу (Web UI):    locust -f load-test/locustfile.py
Іске қосу (консольде): locust -f load-test/locustfile.py --headless --csv load-test/results/qr --csv-full-history
"""
import os
import random
from locust import HttpUser, task, between, LoadTestShape

HOST = "http://localhost:3000"


class Guest(HttpUser):
    host = HOST
    wait_time = between(0.5, 1.0)  # қолданушы әрекеттері арасындағы кідіріс, секунд

    def on_start(self):
        self.table = random.randint(1, 50)
        self.order_id = None

    @task(6)
    def view_menu(self):
        self.client.get(f"/api/menu?table={self.table}", name="GET /api/menu")

    @task(3)
    def create_order(self):
        body = {"table": self.table, "items": [{"id": random.choice([1, 2, 3, 4]), "qty": random.randint(1, 3)}]}
        with self.client.post("/api/orders", json=body, name="POST /api/orders", catch_response=True) as r:
            if r.status_code == 201:
                self.order_id = r.json()["id"]
                r.success()
            else:
                r.failure(f"HTTP {r.status_code}")

    @task(2)
    def check_order(self):
        if self.order_id:
            self.client.get(f"/api/orders/{self.order_id}", name="GET /api/orders/{id}")

    @task(1)
    def pay(self):
        if self.order_id:
            self.client.post("/api/payments",
                             json={"orderId": self.order_id, "cardNumber": "4242424242424242", "tipPercent": 10},
                             name="POST /api/payments")


# LOAD_PROFILE=ramp   (әдепкі) — сатылап өсетін жүктеме, 180 с
# LOAD_PROFILE=stress — шекті жүктемені іздеу, 150 с
PROFILES = {
    # (кезеңнің аяқталу уақыты, секунд; қолданушылар саны; секундына қосылу жылдамдығы)
    "ramp": [(30, 10, 5), (60, 50, 10), (90, 100, 20), (120, 200, 40), (150, 400, 80), (180, 600, 100)],
    "stress": [(30, 200, 50), (60, 600, 100), (90, 1000, 100), (120, 1500, 100), (150, 2000, 100)],
}


class StagedLoad(LoadTestShape):
    stages = PROFILES[os.environ.get("LOAD_PROFILE", "ramp")]

    def tick(self):
        t = self.get_run_time()
        for end, users, rate in self.stages:
            if t < end:
                return users, rate
        return None
