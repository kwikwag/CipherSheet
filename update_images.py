import os
import base64
import glob

def main():
    os.makedirs('imgs', exist_ok=True)
    os.makedirs('imgs-encoded', exist_ok=True)

    # Encode all images in imgs/ to base64 Data URIs in imgs-encoded/
    image_paths = glob.glob('imgs/*.png') + glob.glob('imgs/*.jpg') + glob.glob('imgs/*.jpeg') + glob.glob('imgs/*.gif')
    for filepath in image_paths:
        filename = os.path.basename(filepath)
        name, ext = os.path.splitext(filename)
        ext = ext.lower()
        
        with open(filepath, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
        
        mime = "image/png"
        if ext in [".jpg", ".jpeg"]:
            mime = "image/jpeg"
        elif ext == ".gif":
            mime = "image/gif"
        elif ext == ".svg":
            mime = "image/svg+xml"
            
        data_uri = f"data:{mime};base64,{encoded_string}"
        
        out_filepath = os.path.join('imgs-encoded', f"{name}.html")
        with open(out_filepath, "w") as out_file:
            out_file.write(data_uri)
        print(f"Encoded {filename} to {out_filepath}")

if __name__ == '__main__':
    main()
