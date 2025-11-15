# stm32_can_simulator.py
import random
import time
import paho.mqtt.client as mqtt
import json
from dataclasses import dataclass
from typing import List

@dataclass
class CANFrame:
    can_id: int
    data: List[int]
    dlc: int
    timestamp: float
    node_id: int

class STM32CANSimulator:
    def __init__(self, node_id: int, mqtt_broker: str = "localhost"):
        self.node_id = node_id
        self.client = mqtt.Client(f"stm32_node_{node_id}")
        self.client.connect(mqtt_broker, 1883, 60)
        self.running = False
        
    def generate_can_frame(self) -> CANFrame:
        can_id = random.choice([0x100, 0x200, 0x300, 0x400])
        dlc = random.randint(1, 8)
        data = [random.randint(0, 255) for _ in range(dlc)]
        
        return CANFrame(
            can_id=can_id,
            data=data,
            dlc=dlc,
            timestamp=time.time(),
            node_id=self.node_id
        )
    
    def publish_frame(self, frame: CANFrame):
        payload = {
            "node_id": frame.node_id,
            "can_id": hex(frame.can_id),
            "data": frame.data,
            "dlc": frame.dlc,
            "timestamp": frame.timestamp
        }
        self.client.publish("can/frames", json.dumps(payload))
        
    def run(self, frequency: float = 10):
        self.running = True
        self.client.loop_start()
        
        while self.running:
            frame = self.generate_can_frame()
            self.publish_frame(frame)
            time.sleep(1.0 / frequency)
            
    def stop(self):
        self.running = False
        self.client.loop_stop()
        self.client.disconnect()

if __name__ == "__main__":
    import sys
    node_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    
    simulator = STM32CANSimulator(node_id)
    try:
        print(f"Node {node_id} started")
        simulator.run(frequency=10)
    except KeyboardInterrupt:
        simulator.stop()