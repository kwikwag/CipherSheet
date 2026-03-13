import os
import re
import json
import glob
import urllib.request
from urllib.parse import urlparse

def main():
    os.makedirs('apps-script/src/downloaded', exist_ok=True)

    sources_path = 'sources.json'
    sources = {}
    if os.path.exists(sources_path):
        with open(sources_path, 'r') as f:
            try:
                sources = json.load(f)
                if not isinstance(sources, dict):
                    sources = {}
            except json.JSONDecodeError:
                pass

    # Regex to find https:// URLs in href="..." or src="..."
    url_pattern = re.compile(r'(?:href|src)=["\'](https://[^"\']+)["\']')

    html_files = glob.glob('apps-script/src/*.html')
    
    for filepath in html_files:
        if 'imgs-encoded' in filepath or 'downloaded' in filepath:
            continue

        with open(filepath, 'r') as f:
            content = f.read()

        matches = url_pattern.findall(content)
        changed = False

        for url in matches:
            # We don't want to replace docs links if they are regular <a> tags
            # Let's check what kind of tag it's in by doing a slightly broader match
            # But wait, the user said "html files (not under imgs/encoded) and replaces the reference with include directive"
            
            # Parse URL to get a safe filename
            parsed = urlparse(url)
            filename = os.path.basename(parsed.path)
            if not filename:
                filename = "index"
            
            name, ext = os.path.splitext(filename)
            
            # Determine how we save it. If it's CSS, we wrap it in <style>
            # But the user said "downloads all https:// urls to downloaded/"
            out_filename_with_ext = filename
            out_filename_base = name
            
            downloaded_path = os.path.join('apps-script/src/downloaded', out_filename_with_ext)
            
            # If we don't have it downloaded, fetch it
            if not os.path.exists(downloaded_path):
                print(f"Downloading {url} to {downloaded_path}...")
                try:
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req) as response:
                        data = response.read().decode('utf-8')
                        
                    # If it's a css file, wrap it in <style> tags so it can be evaluated as HTML
                    if ext == '.css':
                        data = f"<style>\n{data}\n</style>"
                        
                    with open(downloaded_path, 'w') as out_f:
                        out_f.write(data)
                except Exception as e:
                    print(f"Failed to download {url}: {e}")
                    continue
            
            sources[f"apps-script/src/downloaded/{out_filename_with_ext}"] = url
            
            # Replace in HTML
            # Careful not to replace inside <a> tags casually if they are just links, but they said all URLs.
            # Usually <link href="url"> or <script src="url">.
            # If we just replace the whole tag (e.g. <link rel="stylesheet" href="...">) with <?!= include(...) ?>
            # Let's just do a naive regex for <link ... href="url" ...> or <script ... src="url" ...>
            
            # Replace <link ... href="url" ...> or <script ... src="url" ...></script>
            # with <?!= include('downloaded/name'); ?>
            
            # Link tag replacement
            link_regex = re.compile(rf'<link[^>]*href=["\']{re.escape(url)}["\'][^>]*>', re.IGNORECASE)
            # Script tag replacement
            script_regex = re.compile(rf'<script[^>]*src=["\']{re.escape(url)}["\'][^>]*>.*?</script>', re.IGNORECASE | re.DOTALL)
            
            include_directive = f"<?!= include('downloaded/{out_filename_base}'); ?>"
            
            if link_regex.search(content):
                content = link_regex.sub(include_directive, content)
                changed = True
                
            if script_regex.search(content):
                content = script_regex.sub(include_directive, content)
                changed = True

        if changed:
            with open(filepath, 'w') as f:
                f.write(content)
            print(f"Updated references in {filepath}")

    with open(sources_path, 'w') as f:
        json.dump(sources, f, indent=2)
    print("Updated sources.json")

if __name__ == '__main__':
    main()
