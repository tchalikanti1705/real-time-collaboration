#!/usr/bin/env python3

import requests
import json
import sys
import time
from datetime import datetime
import uuid

class ConcurrencyPadAPITester:
    def __init__(self, base_url="http://localhost:8001"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.test_room_id = str(uuid.uuid4())[:8]

    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        if headers is None:
            headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        self.log(f"🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"✅ {name} - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, response.text
            else:
                self.log(f"❌ {name} - Expected {expected_status}, got {response.status_code}")
                self.log(f"   Response: {response.text[:200]}")
                return False, {}

        except Exception as e:
            self.log(f"❌ {name} - Error: {str(e)}")
            return False, {}

    def test_health_endpoints(self):
        """Test basic health and info endpoints"""
        self.log("\n=== Testing Health Endpoints ===")
        
        # Test root endpoint
        self.run_test("Root API", "GET", "api/", 200)
        
        # Test health check
        self.run_test("Health Check", "GET", "api/health", 200)

    def test_metrics_endpoints(self):
        """Test metrics endpoints"""
        self.log("\n=== Testing Metrics Endpoints ===")
        
        # Test metrics
        success, metrics = self.run_test("Get Metrics", "GET", "api/metrics", 200)
        if success and isinstance(metrics, dict):
            required_fields = [
                'active_connections', 'messages_per_sec', 'p50_latency_ms', 
                'p95_latency_ms', 'error_count', 'reconnect_count', 
                'total_doc_size_bytes', 'uptime_seconds', 'total_messages', 'rooms_active'
            ]
            missing_fields = [field for field in required_fields if field not in metrics]
            if missing_fields:
                self.log(f"⚠️  Metrics missing fields: {missing_fields}")
            else:
                self.log("✅ All required metrics fields present")
        
        # Test events
        self.run_test("Get Events", "GET", "api/metrics/events", 200)
        self.run_test("Get Events with Limit", "GET", "api/metrics/events?limit=10", 200)

    def test_room_endpoints(self):
        """Test room management endpoints"""
        self.log("\n=== Testing Room Endpoints ===")
        
        # Test list rooms
        self.run_test("List Rooms", "GET", "api/rooms", 200)
        
        # Test get specific room (should work even if room doesn't exist)
        self.run_test("Get Room", "GET", f"api/rooms/{self.test_room_id}", 200)
        
        # Test get room users
        self.run_test("Get Room Users", "GET", f"api/rooms/{self.test_room_id}/users", 200)
        
        # Test persist room
        self.run_test("Persist Room", "POST", f"api/rooms/{self.test_room_id}/persist", 200)
        
        # Test load room
        self.run_test("Load Room", "GET", f"api/rooms/{self.test_room_id}/load", 200)

    def test_simulation_endpoints(self):
        """Test user simulation endpoints"""
        self.log("\n=== Testing Simulation Endpoints ===")
        
        # Test simulate users
        success, result = self.run_test(
            "Simulate Users", 
            "POST", 
            f"api/simulate/users/{self.test_room_id}?count=5", 
            200
        )
        
        if success and isinstance(result, dict):
            if 'simulated_users' in result and result['simulated_users'] == 5:
                self.log("✅ Simulated users created successfully")
            else:
                self.log(f"⚠️  Unexpected simulation result: {result}")
        
        # Wait a moment for simulation to settle
        time.sleep(1)
        
        # Test remove simulated users
        success, result = self.run_test(
            "Remove Simulated Users", 
            "DELETE", 
            f"api/simulate/users/{self.test_room_id}", 
            200
        )
        
        if success and isinstance(result, dict):
            if 'removed' in result:
                self.log(f"✅ Removed {result['removed']} simulated users")
            else:
                self.log(f"⚠️  Unexpected removal result: {result}")

    def test_websocket_endpoint_availability(self):
        """Test if WebSocket endpoint is available (just check if it responds)"""
        self.log("\n=== Testing WebSocket Endpoint Availability ===")
        
        # We can't easily test WebSocket in this script, but we can check if the endpoint exists
        # by trying to connect and seeing if we get a proper WebSocket upgrade response
        try:
            import websocket
            ws_url = self.base_url.replace('https://', 'wss://').replace('http://', 'ws://')
            ws_url = f"{ws_url}/api/ws/{self.test_room_id}?client_id=test-client"
            
            def on_open(ws):
                self.log("✅ WebSocket connection opened successfully")
                ws.close()
            
            def on_error(ws, error):
                self.log(f"⚠️  WebSocket error: {error}")
            
            def on_close(ws, close_status_code, close_msg):
                self.log("✅ WebSocket connection closed")
            
            ws = websocket.WebSocketApp(ws_url,
                                      on_open=on_open,
                                      on_error=on_error,
                                      on_close=on_close)
            
            # Run for a short time
            ws.run_forever(timeout=5)
            
        except ImportError:
            self.log("⚠️  websocket-client not available, skipping WebSocket test")
        except Exception as e:
            self.log(f"⚠️  WebSocket test failed: {e}")

    def run_all_tests(self):
        """Run all API tests"""
        self.log(f"🚀 Starting ConcurrencyPad API Tests")
        self.log(f"📍 Base URL: {self.base_url}")
        self.log(f"🏠 Test Room ID: {self.test_room_id}")
        
        start_time = time.time()
        
        try:
            self.test_health_endpoints()
            self.test_metrics_endpoints()
            self.test_room_endpoints()
            self.test_simulation_endpoints()
            self.test_websocket_endpoint_availability()
            
        except KeyboardInterrupt:
            self.log("\n⚠️  Tests interrupted by user")
        except Exception as e:
            self.log(f"\n❌ Unexpected error during testing: {e}")
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Print results
        self.log(f"\n📊 Test Results:")
        self.log(f"   Tests run: {self.tests_run}")
        self.log(f"   Tests passed: {self.tests_passed}")
        self.log(f"   Tests failed: {self.tests_run - self.tests_passed}")
        self.log(f"   Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        self.log(f"   Duration: {duration:.2f}s")
        
        return self.tests_passed == self.tests_run

def main():
    tester = ConcurrencyPadAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())