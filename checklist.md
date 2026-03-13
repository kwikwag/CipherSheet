# CipherSheet Add-on Launch Checklist

Here are your instructions to wrap up this add-on for a successful launch.

## 1. Take Screenshots
You'll need a set of 4 clear screenshots of the add-on sidebar to include in your welcome dialog and on your website. Take screenshots capturing the sidebar specifically.

1. **`step1-generate-key.png`**: An image of the sidebar in its initial empty state with the specific "Generate new key" button visible.
2. **`step2-protect-cell.png`**: Place a value in the input text area and show the cursor hovering over the active, blue "Protect" button. The Active Key panel below should be visible showing the key loaded.
3. **`step3-unprotect-cell.png`**: The modal popup that appears when selecting "Unprotect". Show the warning with the text input field asking them to type exactly the cell address to confirm (from `decrypt-confirm.html`).
4. **`step4-key-loaded.png`**: A snapshot highlighting the bottom area showing `KEY ACTIVE`, `AES-256-GCM`, and the fingerprint hash.

## 2. Incorporate images into the Add-on
In `onboarding.html`, I left HTML comments indicating where to replace the text with `<img>` tags pointing to your hosted image URLs.
(e.g., `<!-- Replace this comment with: <img src="https://your-domain.com/assets/step1-generate-key.png" alt="Generate Key"> -->`).

## 3. Host the Website Directory
I've created a `/docs` directory inside your CipherSheet project folder containing an `index.html` file designed explicitly for GitHub Pages.
- Setup GitHub Pages by pushing the repository to GitHub. Go to your Repo settings -> Pages -> Source: `Deploy from a branch` -> Folder: `/docs`.
- Don't forget to push your images into the `docs/assets/` directory so they render on the page.

## 4. Google Workspace Marketplace preparation
Once your GitHub Pages site is live:
1. Grab the live URL for your Terms of Service and Privacy Policy sections. Provide these to the Google Cloud Console OAuth consent screen setup.
2. Your add-on uses `https://www.googleapis.com/auth/spreadsheets.currentonly` (or `spreadsheets`). Note that any add-on asking for sheet modifications might undergo an OAuth verification process and security assessment — be upfront in your submission notes that the add-on runs entirely client-side cryptography.
3. Update the `[Link to Google Workspace Marketplace]` placeholder within `docs/index.html` with your live Store listing link.
