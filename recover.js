const fs = require('fs');
const readline = require('readline');

async function recover() {
  const fileStream = fs.createReadStream('C:\\Users\\MANISH\\.gemini\\antigravity\\brain\\4d02f916-8d13-4679-8d7b-34b1842d0319\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const files = {};
  
  for await (const line of rl) {
    try {
      const entry = JSON.parse(line);
      if (entry.tool_calls) {
        for (const call of entry.tool_calls) {
          let args = call.args;
          if (typeof args === 'string') {
              args = JSON.parse(args);
          }
          if (call.name === 'write_to_file' || call.name === 'multi_replace_file_content' || call.name === 'replace_file_content') {
            let file = args.TargetFile;
            if (file) {
              file = file.replace(/^"|"$/g, '').replace(/\\\\/g, '\\');
              if (file.includes('CineQ')) {
                // Keep the latest state from write_to_file
                if (call.name === 'write_to_file') {
                  files[file] = args.CodeContent;
                }
              }
            }
          }
        }
      }
    } catch(e) {}
  }

  for (const [path, content] of Object.entries(files)) {
     if (path.includes('app') || path.includes('components') || path.includes('package.json') || path.includes('tailwind.config') || path.includes('postcss.config')) {
        const normalizedPath = path.replace(/\\\\/g, '\\');
        const dir = normalizedPath.substring(0, normalizedPath.lastIndexOf('\\'));
        if (dir) fs.mkdirSync(dir, { recursive: true });
        if (content) {
          fs.writeFileSync(normalizedPath, content);
          console.log('Recovered:', normalizedPath);
        }
     }
  }
}
recover();
