import os
from pymongo import MongoClient
from dotenv import load_dotenv
import certifi
import sys

# Load environment variables (gets MONGO_URI for Atlas)
load_dotenv()

# Configuration
LOCAL_URI = "mongodb://localhost:27017/"
LOCAL_DB_NAME = "hospital_management"
ATLAS_URI = os.environ.get("MONGO_URI")

def migrate():
    print("--- Starting Data Migration ---")
    print(f"Source: Local MongoDB ({LOCAL_DB_NAME})")
    print("Destination: MongoDB Atlas")

    if not ATLAS_URI:
        print("Error: MONGO_URI not found in .env file.")
        return

    # 1. Connect to Local DB
    try:
        local_client = MongoClient(LOCAL_URI)
        local_db = local_client[LOCAL_DB_NAME]
        # Check if local DB exists/has collections
        if LOCAL_DB_NAME not in local_client.list_database_names():
            print(f"Warning: Local database '{LOCAL_DB_NAME}' does not seem to exist.")
            print("Available local databases:", local_client.list_database_names())
            # Continue anyway, maybe it exists but listing failed or empty
        print("Connected to Local DB.")
    except Exception as e:
        print(f"Failed to connect to Local DB: {e}")
        return

    # 2. Connect to Atlas DB
    try:
        # Use certifi for SSL validity
        uuid_representation='standard'
        atlas_client = MongoClient(ATLAS_URI, tlsCAFile=certifi.where(), uuidRepresentation=uuid_representation)
        atlas_db = atlas_client.get_default_database()
        print(f"Connected to Atlas DB: {atlas_db.name}")
    except Exception as e:
        print(f"Failed to connect to Atlas DB: {e}")
        # Fallback: Try without certifi if it fails (sometimes needed depending on env)
        try:
             print("Retrying Atlas connection without explicit CA file...")
             atlas_client = MongoClient(ATLAS_URI, uuidRepresentation='standard')
             atlas_db = atlas_client.get_default_database()
             print(f"Connected to Atlas DB (retry success): {atlas_db.name}")
        except Exception as e2:
             print(f"Retry failed: {e2}")
             return

    # 3. Perform Migration
    try:
        collections = local_db.list_collection_names()
        print(f"\nFound {len(collections)} collections to migrate: {collections}")

        for coll_name in collections:
            if coll_name.startswith("system."): continue

            print(f"\nProcessing collection: {coll_name}")
            
            # Fetch data
            data = list(local_db[coll_name].find())
            count = len(data)
            
            if count > 0:
                print(f"  Found {count} documents locally.")
                
                # Clear target collection to prevent duplicates (since user said it's currently empty/broken)
                # If you want to merge, remove this drop() line.
                print("  Clearing target collection in Atlas...")
                atlas_db[coll_name].drop()
                
                print(f"  Inserting {count} documents to Atlas...")
                atlas_db[coll_name].insert_many(data)
                print("  Success.")
            else:
                print("  Collection is empty. Skipping.")

        print("\n--- Migration Completed Successfully ---")

    except Exception as e:
        print(f"\nMigration interrupted/failed: {e}")

if __name__ == "__main__":
    # Ensure certifi is installed
    try:
        import certifi
    except ImportError:
        print("Installing certifi...")
        os.system(f"{sys.executable} -m pip install certifi")
        import certifi

    migrate()
