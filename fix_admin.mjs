import fs from 'fs';

let content = fs.readFileSync('src/admin/main.jsx', 'utf8');

// The file likely has duplicated content at the end
// Let's find the LAST occurrence of AdminApp() return block end
const endMarker = 'createRoot(document.getElementById("root")).render(<AdminApp />);';
const parts = content.split(endMarker);

// Reconstruct only with the first part + marker
if (parts.length > 1) {
    const fixedContent = parts[0] + endMarker + '\n';
    fs.writeFileSync('src/admin/main.jsx', fixedContent);
    console.log('Fixed truncation/duplication issue');
} else {
    console.log('Marker not found or already correct');
}
