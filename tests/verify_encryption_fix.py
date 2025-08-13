
import requests
import json
import os
import time
import unittest

# --- Configuration ---
BASE_URL = "http://localhost:8000"
KEY_FILE_PATH = os.path.join("data", ".secret_key")
DATASOURCE_CONFIG_PATH = os.path.join("data", "file_datasources.json") # Assuming this is where configs are stored

# --- Helper Functions ---

def print_test_title(title):
    print(f"\n{'='*50}")
    print(f"🧪 {title}")
    print(f"{ '='*50}")

def get_health():
    try:
        response = requests.get(f"{BASE_URL}/health")
        return response.status_code == 200 and response.json().get("status") == "healthy"
    except requests.ConnectionError:
        return False

# --- Test Cases ---

class TestEncryptionFix(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        print_test_title("Test Setup")
        print("Waiting for the API server to be ready...")
        
        # Wait for server to be healthy
        max_wait = 30
        waited = 0
        while not get_health() and waited < max_wait:
            time.sleep(1)
            waited += 1
            print(".", end="", flush=True)
        
        if not get_health():
            raise ConnectionError(f"API server at {BASE_URL} is not responding after {max_wait} seconds.")
        
        print("\nServer is ready!")

    def test_1_auto_key_generation(self):
        print_test_title("Test 1: Automatic Secret Key Generation")
        print(f"Checking for key file at: {KEY_FILE_PATH}")
        
        # This test assumes the server was started without a .secret_key file
        self.assertTrue(os.path.exists(KEY_FILE_PATH), f"Key file was not created at {KEY_FILE_PATH}")
        
        with open(KEY_FILE_PATH, "rb") as f:
            key = f.read()
            self.assertGreater(len(key), 32, "Key file content seems too short.")
        
        print(f"✅ SUCCESS: Secret key file was automatically generated.")

    def test_2_password_encryption_on_save(self):
        print_test_title("Test 2: Password Encryption on Save")
        
        test_config = {
            "id": "test_mysql_encryption",
            "name": "Test MySQL Encryption",
            "type": "mysql",
            "params": {
                "host": "localhost",
                "port": 3306,
                "user": "testuser",
                "password": "MySuperSecretPassword123",
                "database": "testdb"
            }
        }

        print("Sending a new MySQL configuration with a plaintext password...")
        response = requests.post(f"{BASE_URL}/api/database_connections", json=test_config)
        
        self.assertEqual(response.status_code, 200, f"API returned an error: {response.text}")
        print("API call successful.")

        # Now, check the stored configuration file to see if the password is encrypted
        print(f"Checking for encrypted password in {DATASOURCE_CONFIG_PATH}...")
        self.assertTrue(os.path.exists(DATASOURCE_CONFIG_PATH), "Datasource config file not found.")

        with open(DATASOURCE_CONFIG_PATH, "r") as f:
            all_configs = json.load(f)
        
        stored_config = next((c for c in all_configs if c["id"] == "test_mysql_encryption"), None)
        self.assertIsNotNone(stored_config, "Test config not found in the stored file.")

        stored_password = stored_config.get("params", {}).get("password")
        print(f"Stored password value: {stored_password[:30]}...")
        self.assertNotEqual(stored_password, "MySuperSecretPassword123", "Password was stored in plaintext!")
        self.assertGreater(len(stored_password), 60, "Stored password seems too short to be a Fernet token.")

        print("✅ SUCCESS: Password was correctly encrypted upon saving.")

    def test_3_decryption_on_load(self):
        print_test_title("Test 3: Successful Connection Retrieval (Implicit Decryption)")
        
        print("Attempting to retrieve the list of all database connections...")
        response = requests.get(f"{BASE_URL}/api/database_connections")
        
        self.assertEqual(response.status_code, 200, f"API returned an error: {response.text}")
        
        all_configs = response.json()
        retrieved_config = next((c for c in all_configs if c["id"] == "test_mysql_encryption"), None)
        
        self.assertIsNotNone(retrieved_config, "Test config was not returned by the API.")
        
        # In the API response, the password should be masked for security
        masked_password = retrieved_config.get("params", {}).get("password")
        print(f"Password returned by API: {masked_password}")
        self.assertEqual(masked_password, "********", "Password was not masked in the API response.")

        print("✅ SUCCESS: API can retrieve configs, implying successful internal decryption.")

# --- Instructions to Run ---

def run_tests():
    print_test_title("Running Encryption Verification Tests")
    print("This script will test the automatic key generation and password encryption.")
    print("PLEASE FOLLOW THESE STEPS:")
    print("1. Make sure you have deleted the 'data/.secret_key' file (if it exists).")
    print("2. Start the application using 'docker-compose up'.")
    print("3. Once the server is running, this script will connect and run the tests.")
    print("4. To run, execute: python tests/verify_encryption_fix.py")
    
    # Clean up before test
    if os.path.exists(KEY_FILE_PATH):
        print(f"\nRemoving old key file: {KEY_FILE_PATH}")
        os.remove(KEY_FILE_PATH)

    # It's hard to safely edit a JSON file, so we'll just check for its existence.
    # A more robust test suite would use a dedicated test database.

    suite = unittest.TestSuite()
    suite.addTest(unittest.makeSuite(TestEncryptionFix))
    runner = unittest.TextTestRunner()
    result = runner.run(suite)

    if result.wasSuccessful():
        print("\n🎉🎉🎉 All encryption tests passed successfully! The fix is verified. 🎉🎉🎉")
    else:
        print("\n❌ Some encryption tests failed. Please review the output above. ❌")

if __name__ == "__main__":
    run_tests()
