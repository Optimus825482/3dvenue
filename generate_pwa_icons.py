from PIL import Image
import os

def generate_icons():
    source_path = "public/logo.png"
    
    if not os.path.exists(source_path):
        print(f"Error: {source_path} not found. Please run generate_logo.py first.")
        return

    img = Image.open(source_path)
    
    # 192x192
    img_192 = img.resize((192, 192), Image.Resampling.LANCZOS)
    img_192.save("public/pwa-192x192.png")
    print("Generated public/pwa-192x192.png")
    
    # 512x512 (Just copy/save as is since source is 512)
    img.save("public/pwa-512x512.png")
    print("Generated public/pwa-512x512.png")
    
    # Apple Touch Icon (180x180) - Optional but good for iOS
    img_180 = img.resize((180, 180), Image.Resampling.LANCZOS)
    img_180.save("public/apple-touch-icon.png")
    print("Generated public/apple-touch-icon.png")

if __name__ == "__main__":
    generate_icons()
