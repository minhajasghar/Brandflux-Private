import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
print(f"API Key read: {api_key}")

if not api_key:
    print("Error: GEMINI_API_KEY not found in env")
    exit(1)

genai.configure(api_key=api_key)

# We will test two highly stable, fresh models: models/gemini-2.5-flash and models/gemini-2.0-flash
models_to_test = ["models/gemini-2.5-flash", "models/gemini-2.0-flash", "models/gemini-flash-latest"]

for model_name in models_to_test:
    print(f"\nTesting model: {model_name}...")
    try:
        model = genai.GenerativeModel(model_name=model_name)
        print("Basic generation...")
        res = model.generate_content("Say 'success' in exactly one word.")
        print(f"Response: '{res.text.strip()}'")
        
        print("JSON generation...")
        res_json = model.generate_content(
            "Generate JSON: {'status': 'success'}",
            generation_config={"response_mime_type": "application/json"}
        )
        print(f"JSON Response: '{res_json.text.strip()}'")
        print(f"SUCCESS: Model {model_name} is fully operational!")
        break
    except Exception as e:
        print(f"FAILED for {model_name}: {str(e)}")
