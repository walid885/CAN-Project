# stm32_can_simulator.py
import random
import time
import paho.mqtt.client as mqtt
import json
import sys
import signal
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
    def __init__(self, node_id: int, mqtt_broker: str = "localhost", mqtt_port: int = 1884):
        self.node_id = node_id
        self.mqtt_broker = mqtt_broker
        self.mqtt_port = mqtt_port
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"stm32_node_{node_id}")
        self.running = False
        self.connected = False
        
        self.client.on_connect = self.on_connect
        self.client.on_disconnect = self.on_disconnect
        
    def on_connect(self, client, userdata, flags, rc, properties):
        if rc == 0:
            self.connected = True
            print(f"[Node {self.node_id}] Connected to MQTT {self.mqtt_broker}:{self.mqtt_port}")
        else:
            print(f"[Node {self.node_id}] Connection failed: {rc}")
            
    def on_disconnect(self, client, userdata, flags, rc, properties):
        self.connected = False
        print(f"[Node {self.node_id}] Disconnected")
        
    def connect_broker(self):
        try:
            self.client.connect(self.mqtt_broker, self.mqtt_port, 60)
            self.client.loop_start()
            
            for _ in range(50):
                if self.connected:
                    return
                time.sleep(0.1)
                
            raise Exception("Connection timeout")
        except Exception as e:
            print(f"[Node {self.node_id}] Error: {e}")
            raise
        
    def generate_can_frame(self) -> CANFrame:
        can_id = random.choice([0x100, 0x200, 0x300, 0x400, 0x500])
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
        self.client.publish("can/frames", json.dumps(payload), qos=1)
        
    def run(self, frequency: float = 10):
        self.running = True
        frame_count = 0
        
        print(f"[Node {self.node_id}] Running at {frequency} Hz")
        
        while self.running:
            if self.connected:
                frame = self.generate_can_frame()
                self.publish_frame(frame)
                frame_count += 1
                
                if frame_count % 100 == 0:
                    print(f"[Node {self.node_id}] {frame_count} frames")
            else:
                print(f"[Node {self.node_id}] Waiting...")
                time.sleep(1)
                continue
                
            time.sleep(1.0 / frequency)
            
    def stop(self):
        print(f"[Node {self.node_id}] Stopping...")
        self.running = False
        time.sleep(0.5)
        self.client.loop_stop()
        self.client.disconnect()

def signal_handler(sig, frame):
    sys.exit(0)

if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    node_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    broker = sys.argv[2] if len(sys.argv) > 2 else "localhost"
    port = int(sys.argv[3]) if len(sys.argv) > 3 else 1884
    frequency = float(sys.argv[4]) if len(sys.argv) > 4 else 10
    
    simulator = STM32CANSimulator(node_id, mqtt_broker=broker, mqtt_port=port)
    
    try:
        simulator.connect_broker()
        simulator.run(frequency=frequency)
    except KeyboardInterrupt:
        pass
    finally:
        simulator.stop()