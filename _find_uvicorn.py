"""Find all python.exe processes and their commandlines."""
import subprocess, sys
# Use full path to wmic
out = subprocess.run(
    ['cmd', '/c', 'wmic process where "name=\'python.exe\'" get ProcessId,CommandLine /format:csv'],
    capture_output=True, text=True
).stdout
for line in out.splitlines():
    if 'uvicorn' in line.lower() or 'main:app' in line or '8000' in line:
        print(line[:300])
print("---all python pids---")
for line in out.splitlines():
    if line.strip() and ('python.exe' in line.lower() or line.count(',') >= 1):
        # csv line: Node,CommandLine,ProcessId
        parts = line.split(',')
        if len(parts) >= 3 and parts[-1].strip().isdigit():
            cmd = parts[1][:200] if len(parts) > 2 else ''
            print(f"PID {parts[-1].strip()}: {cmd}")
