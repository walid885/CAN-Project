# stm32_can_simulator.py
import random
import time
import paho.mqtt.client as mqtt
import json
import sys
import signal
from dataclasses import dataclass
from typing import List
from datetime import datetime

@dataclass
class CANFrame:
    can_id: int
    data: List[int]
    dlc: int
    timestamp: float
    date: str
    node_id: int

class STM32CANSimulator:
    def __init__(self, node_id: int, mqtt_broker: str = "localhost", mqtt_port: int = 1884):
        self.node_id = node_id
        self.mqtt_broker = mqtt_broker
        self.mqtt_port = mqtt_port
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"stm32_node_{node_id}")
        self.running = False
        self.connected = False
        
        # State tracking for smooth transitions
        self.current_rpm = 1500
        self.current_speed = 60
        self.current_temp = 90
        self.current_fuel = 180
        self.current_voltage = 130
        
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
        
    def generate_smooth_frame(self, can_id: int) -> CANFrame:
        now = time.time()
        date_str = datetime.now().strftime("%d/%m/%Y")
        
        if can_id == 0x100:  # Engine Speed - smooth transitions
            self.current_rpm += random.randint(-200, 200)
            self.current_rpm = max(800, min(6000, self.current_rpm))
            data = [(self.current_rpm >> 8) & 0xFF, self.current_rpm & 0xFF] + [0]*6
        elif can_id == 0x200:  # Vehicle Speed
            self.current_speed += random.randint(-5, 5)
            self.current_speed = max(0, min(180, self.current_speed))
            data = [self.current_speed, 0, 0, 0, 0, 0, 0, 0]
        elif can_id == 0x300:  # Engine Temp
            self.current_temp += random.randint(-2, 2)
            self.current_temp = max(60, min(120, self.current_temp))
            data = [self.current_temp + 40, 0, 0, 0, 0, 0, 0, 0]
        elif can_id == 0x400:  # Fuel Level
            self.current_fuel += random.randint(-1, 0)
            self.current_fuel = max(20, min(255, self.current_fuel))
            data = [self.current_fuel, 0, 0, 0, 0, 0, 0, 0]
        else:  # Battery Voltage
            self.current_voltage += random.randint(-2, 2)
            self.current_voltage = max(120, min(145, self.current_voltage))
            data = [self.current_voltage, 0, 0, 0, 0, 0, 0, 0]
        
        return CANFrame(
            can_id=can_id,
            data=data,
            dlc=8,
            timestamp=now,
            date=date_str,
            node_id=self.node_id
        )
    
    def publish_frame(self, frame: CANFrame):
        payload = {
            "node_id": frame.node_id,
            "can_id": hex(frame.can_id),
            "data": frame.data,
            "dlc": frame.dlc,
            "timestamp": frame.timestamp,
            "date": frame.date
        }
        self.client.publish("can/frames", json.dumps(payload), qos=0)
        
    def run(self, frequency: float = 10):
        self.running = True
        frame_count = 0
        last_print = time.time()
        can_ids = [0x100, 0x200, 0x300, 0x400, 0x500]
        
        print(f"[Node {self.node_id}] Starting at {frequency} Hz")
        
        while self.running:
            if not self.connected:
                print(f"[Node {self.node_id}] Reconnecting...")
                time.sleep(1)
                continue
            
            # Send all 5 CAN IDs in rapid succession every cycle
            for can_id in can_ids:
                frame = self.generate_smooth_frame(can_id)
                self.publish_frame(frame)
                frame_count += 1
                time.sleep(0.01)  # 10ms between each CAN ID
            
            if time.time() - last_print >= 10:
                print(f"[Node {self.node_id}] {frame_count} frames")
                last_print = time.time()
            
            # Wait for next cycle
            time.sleep(1.0 / frequency)
            
    def stop(self):
        print(f"[Node {self.node_id}] Stopping...")
        self.running = False
        time.sleep(0.2)
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
    frequency = float(sys.argv[4]) if len(sys.argv) > 4 else 1  # 1 Hz = all signals every second
    
    simulator = STM32CANSimulator(node_id, mqtt_broker=broker, mqtt_port=port)
    
    try:
        simulator.connect_broker()
        simulator.run(frequency=frequency)
    except KeyboardInterrupt:
        pass
    finally:
        simulator.stop()