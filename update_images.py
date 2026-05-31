import os
import base64
import glob

CONTENT_TYPES = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "git": "image/gif",
}

SRC_DIR = 'imgs'
TARGET_DIR = 'apps-script/server/imgs-encoded'

def main():
    os.makedirs(SRC_DIR, exist_ok=True)
    os.makedirs(TARGET_DIR, exist_ok=True)

    # Encode all images in imgs/ to base64 Data URIs in TARGET_DIR
    image_paths = [
        path
        for ext in CONTENT_TYPES
        for path in glob.glob(f'imgs/*.{ext}')
    ]
    for filepath in image_paths:
        filename = os.path.basename(filepath)
        name, ext = os.path.splitext(filename)
        ext = ext.lower()
        
        with open(filepath, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
        
        mime = CONTENT_TYPES[filepath.rsplit(".", 1)[-1]]
            
        data_uri = f"data:{mime};base64,{encoded_string}"
        
        out_filepath = os.path.join(TARGET_DIR, f"{name}.html")
        with open(out_filepath, "w") as out_file:
            out_file.write(data_uri)
        print(f"Encoded {filename} to {out_filepath}")

if __name__ == '__main__':
    main()
