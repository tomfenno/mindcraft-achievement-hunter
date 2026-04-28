import argparse
import csv
import json
import shutil
import subprocess
import time
from datetime import datetime
import tempfile
import re
import sys
import os
import time
import filecmp
import json
import glob
import socket
import signal

import boto3

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_BENCHMARK_TEMPLATE = os.path.join(
    PROJECT_ROOT, "tasks", "server_templates", "vanilla_base"
)
ACHIEVEMENT_HUNTER_CHECKPOINT = os.path.join(
    PROJECT_ROOT, "achievement_hunter", "rollouts", "checkpoint.json"
)

BLOCKED_ACTIONS_COOKING = [
    '!activate', '!attackPlayer', '!checkBlueprint', '!checkBlueprintLevel',
    '!clearChat', '!clearFurnace', '!consume', '!craftable', '!discard',
    '!endGoal', '!entities', '!equip', '!followPlayer', '!getBlueprint', '!getBlueprintLevel',
    '!goToBed', '!help', '!modes', '!moveAway', '!newAction', '!placeHere', '!putInChest',
    '!restart', '!setMode', '!stay', '!stfu', '!stop'
]
BLOCKED_ACTIONS_CRAFTING = [
    '!activate', '!attack', '!attackPlayer', '!checkBlueprint', '!checkBlueprintLevel',
    '!clearChat', '!clearFurnace', '!consume', '!craftable', '!discard', '!endConversation',
    '!endGoal', '!entities', '!followPlayer', '!getBlueprint', '!getBlueprintLevel',
    '!goToBed', '!help', '!modes', '!newAction', '!putInChest', '!restart',
    '!searchForEntity', '!setMode', '!stay', '!stfu', '!stop', '!takeFromChest',
    '!viewChest'
]
BLOCKED_ACTIONS_CONSTRUCTION = [
    '!activate', '!attackPlayer', '!clearChat', '!clearFurnace', '!collectBlocks',
    '!consume', '!craftable', '!discard', '!endConversation', '!endGoal', '!entities',
    '!equip', '!followPlayer', '!getBlueprint', '!getBlueprintLevel', '!goToBed',
    '!help', '!modes', '!moveAway', '!newAction', '!placeHere', '!putInChest',
    '!restart', '!searchForBlock', '!searchForEntity', '!setMode', '!stay', '!stfu',
    '!stop', '!takeFromChest', '!viewChest', '!craftRecipe', '!smeltItem'
]

def analyze_json_file(file_path):
    """
    Analyzes a single JSON file to extract the task outcome.

    Args:
        file_path (str): Path to the JSON file.

    Returns:
        str or None: The task outcome string if found, otherwise None.
    """
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)
            if "turns" in data:
                for turn in data["turns"]:
                    if turn.get("role") == "system" and "content" in turn:
                        if isinstance(turn["content"], str) and "Task ended with score : " in turn["content"]:
                            if "Task ended with score : 1" in turn["content"]:
                                return 1
                            elif "Task ended with score : 0" in turn["content"]:
                                return 0
                            else:
                                score = float(turn["content"].split(":")[-1].strip())
                                return score
                            
                            
        return None
    except FileNotFoundError:
        print(f"Error: File not found: {file_path}")
        return None
    except json.JSONDecodeError:
        print(f"Error: Invalid JSON format in: {file_path}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred while processing {file_path}: {e}")
        return None
    
def extract_result(folder_path):
    folder_name = os.path.basename(folder_path)
    json_files = glob.glob(os.path.join(folder_path, "*.json"))
    # assert len(json_files) == 2, f"Expected 2 json files in {folder_name}, found {len(json_files)}"

    if not json_files:
        return None
    else: 
        score = None
        curr_score = 0
        for json_file in json_files:
            score = analyze_json_file(json_file)
            if score is not None:
                max_score = max(score, curr_score)
                curr_score = max_score

        return curr_score
    
def aggregate_results(local_folders):
    """
    Aggregates the analysis results for each folder.

    Args:
        local_folders (list): List of local folder paths containing the JSON files.

    Returns:
        dict: A dictionary where keys are folder names and values are the aggregated outcomes.
    """
    aggregated_data = {}

    total = 0
    successful = 0
    successful_tasks = []

    task_type = local_folders[0].split("/")[-2]
    if "cooking" in task_type:
        task_type = "cooking"
    elif "techtree" in task_type:
        task_type = "techtree"
    elif "construction" in task_type:
        task_type = "construction"

    for folder_path in local_folders:
        folder_name = os.path.basename(folder_path)

        try: 
            result = extract_result(folder_path)
            
            if result == 1:
                successful_tasks.append(folder_name)
            if result is not None:
                total += 1
                successful += result
        except Exception as e:
            print(f"Error processing {folder_name}: {e}")

    successful_tasks.sort()

    if task_type == "construction":
        successful = successful / total
    
    return {
        "total": total,
        "successful": successful,
    }

def check_folder_results(folder_path):
    """
    Evaluate all JSON files in a folder and its subfolders and calculate success metrics.
    
    Args:
        folder_path (str): Path to the folder containing JSON log files.
        
    Returns:
        dict: A dictionary with success metrics.
    """
    print(f"Checking results in folder: {folder_path}")
    
    # Check if the folder exists
    if not os.path.exists(folder_path):
        print(f"Error: Folder not found: {folder_path}")
        return None
    
    # Find all subfolders (task IDs) in the given folder
    if os.path.isdir(folder_path):
        subfolders = [f for f in glob.glob(os.path.join(folder_path, "*")) if os.path.isdir(f)]
        if subfolders:
            # If there are subfolders, evaluate each subfolder
            print(f"Found {len(subfolders)} subfolders to evaluate")
            results = aggregate_results(subfolders)
        else:
            # If no subfolders, treat the folder itself as a results folder
            print("No subfolders found, evaluating the folder itself")
            results = aggregate_results([folder_path])
            
        # Calculate success rate
        if results["total"] > 0:
            results["success_rate"] = results["successful"] / results["total"]
        else:
            results["success_rate"] = 0.0
            
        # Print summary
        print("\n=== Evaluation Results ===")
        print("\nEvaluating Tasks!")
        print(f"Results so far: {results['total']}")

        if "construction" not in folder_path:
            print(f"Successful tasks: {results['successful']}")

        if "construction" not in folder_path:
            print(f"Success rate: {results['success_rate']:.2f}")
        else:
            print(f"Success rate: {results['successful']:.2f}")
        
        return results
    else:
        print(f"Error: {folder_path} is not a directory")
        return None

def read_settings(file_path):
    """Read and parse the settings.js file to get agent profiles."""
    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()

    # Remove `export default` and trailing commas
    content = re.sub(r'export\s+default', '', content)
    content = re.sub(r',\s*(?=[}\]])', '', content)

    # Remove JavaScript comments
    content = re.sub(r'//.*', '', content)

    # Remove trailing commas (e.g., before } or ])
    content = re.sub(r',\s*(?=[}\]])', '', content)

    # Strip leading and trailing whitespace
    content = content.strip()

    json_data = json.loads(content)

    profiles = json_data['profiles']

    ## profiles is a list of strings like "./andy.json" and "./bob.json"

    agent_names = [profile.split('/')[-1].split('.')[0] for profile in profiles]
    return agent_names 

def update_keys_json():
    """Update the keys.json file with the specified key-value pair."""
    with open("keys.example.json", 'r', encoding='utf-8') as file:
        content = file.read()
    data = json.loads(content)

    # Update keys with environment variables
    for key in data.keys():
        env_value = os.getenv(key)  # Fetch from environment variables
        if env_value:  # If the variable exists, update it
            data[key] = env_value

    with open("keys.json", 'w', encoding='utf-8') as file:
        json.dump(data, file, indent=4)

def resolve_project_path(path_value):
    if os.path.isabs(path_value):
        return os.path.normpath(path_value)
    return os.path.normpath(os.path.join(PROJECT_ROOT, path_value))

def load_json_file(file_path):
    with open(file_path, "r", encoding="utf-8") as file:
        return json.load(file)

def ensure_directory(path_value):
    os.makedirs(path_value, exist_ok=True)

def safe_remove_tree(target_path, allowed_root):
    if not os.path.exists(target_path):
        return
    target_abs = os.path.abspath(target_path)
    allowed_abs = os.path.abspath(allowed_root)
    if os.path.commonpath([target_abs, allowed_abs]) != allowed_abs:
        raise ValueError(f"Refusing to delete path outside benchmark root: {target_abs}")
    shutil.rmtree(target_abs)

def append_or_replace_manifest(manifests, new_manifest):
    key = (
        new_manifest["agent_label"],
        new_manifest["seed"],
        new_manifest["task_id"],
    )
    filtered = [
        manifest for manifest in manifests
        if (manifest["agent_label"], manifest["seed"], manifest["task_id"]) != key
    ]
    filtered.append(new_manifest)
    filtered.sort(key=lambda manifest: (
        manifest["agent_label"],
        manifest["seed"],
        manifest["task_id"],
    ))
    return filtered

def load_existing_episode_manifests(suite_root):
    manifests = []
    for manifest_path in glob.glob(
        os.path.join(suite_root, "**", "episode_manifest.json"),
        recursive=True,
    ):
        try:
            manifests.append(load_json_file(manifest_path))
        except Exception as exc:
            print(f"Skipping unreadable manifest {manifest_path}: {exc}")
    manifests.sort(key=lambda manifest: (
        manifest["agent_label"],
        manifest["seed"],
        manifest["task_id"],
    ))
    return manifests

def write_results_jsonl(results_path, manifests):
    with open(results_path, "w", encoding="utf-8") as file:
        for manifest in manifests:
            file.write(json.dumps(manifest, sort_keys=True) + "\n")

def serialize_metadata_value(value):
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, sort_keys=True)
    return str(value)

def write_summary_reports(suite_root, manifests):
    per_task_rows = {}
    summary_rows = {}

    for manifest in manifests:
        score = manifest.get("score", 0) or 0
        success = 1 if score >= 1 else 0
        task_type = manifest.get("task_type", "")
        advancement_id = manifest.get("advancement_id")
        target = manifest.get("target")
        target_any_of = manifest.get("target_any_of")
        serialized_target = serialize_metadata_value(target)
        serialized_target_any_of = serialize_metadata_value(target_any_of)

        per_task_key = (
            manifest["agent_label"],
            manifest["agent_name"],
            manifest["mode"],
            manifest["task_id"],
            task_type,
            serialize_metadata_value(advancement_id),
            serialized_target,
            serialized_target_any_of,
        )
        if per_task_key not in per_task_rows:
            per_task_rows[per_task_key] = {
                "agent_label": manifest["agent_label"],
                "agent_name": manifest["agent_name"],
                "mode": manifest["mode"],
                "task_id": manifest["task_id"],
                "task_type": task_type,
                "advancement_id": serialize_metadata_value(advancement_id),
                "target": serialized_target,
                "target_any_of": serialized_target_any_of,
                "runs": 0,
                "successful_runs": 0,
            }
        per_task_rows[per_task_key]["runs"] += 1
        per_task_rows[per_task_key]["successful_runs"] += success

        summary_key = (
            manifest["agent_label"],
            manifest["agent_name"],
            manifest["mode"],
        )
        if summary_key not in summary_rows:
            summary_rows[summary_key] = {
                "agent_label": manifest["agent_label"],
                "agent_name": manifest["agent_name"],
                "mode": manifest["mode"],
                "runs": 0,
                "successful_runs": 0,
            }
        summary_rows[summary_key]["runs"] += 1
        summary_rows[summary_key]["successful_runs"] += success

    per_task_path = os.path.join(suite_root, "per_task.csv")
    with open(per_task_path, "w", newline="", encoding="utf-8") as file:
        fieldnames = [
            "agent_label",
            "agent_name",
            "mode",
            "task_id",
            "task_type",
            "advancement_id",
            "target",
            "target_any_of",
            "runs",
            "successful_runs",
            "success_rate",
        ]
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        for row in sorted(per_task_rows.values(), key=lambda item: (
            item["agent_label"],
            item["task_id"],
        )):
            runs = row["runs"]
            row["success_rate"] = row["successful_runs"] / runs if runs else 0
            writer.writerow(row)

    summary_path = os.path.join(suite_root, "summary.csv")
    with open(summary_path, "w", newline="", encoding="utf-8") as file:
        fieldnames = [
            "agent_label",
            "agent_name",
            "mode",
            "runs",
            "successful_runs",
            "success_rate",
        ]
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        for row in sorted(summary_rows.values(), key=lambda item: item["agent_label"]):
            runs = row["runs"]
            row["success_rate"] = row["successful_runs"] / runs if runs else 0
            writer.writerow(row)

def format_property_value(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)

def update_properties_file(file_path, overrides):
    with open(file_path, "r", encoding="utf-8") as file:
        lines = file.readlines()

    seen_keys = set()
    updated_lines = []
    for line in lines:
        if "=" not in line or line.lstrip().startswith("#"):
            updated_lines.append(line)
            continue

        key, _ = line.split("=", 1)
        if key in overrides:
            updated_lines.append(f"{key}={format_property_value(overrides[key])}\n")
            seen_keys.add(key)
        else:
            updated_lines.append(line)

    for key, value in overrides.items():
        if key not in seen_keys:
            updated_lines.append(f"{key}={format_property_value(value)}\n")

    with open(file_path, "w", encoding="utf-8") as file:
        file.writelines(updated_lines)

def choose_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return sock.getsockname()[1]

def server_log_indicates_ready(output_path):
    if not output_path or not os.path.exists(output_path):
        return False
    try:
        with open(output_path, "r", encoding="utf-8", errors="ignore") as file:
            content = file.read()
    except OSError:
        return False
    return "Done (" in content or 'For help, type "help"' in content

def wait_for_server_ready(port, process, output_path=None, timeout_seconds=180):
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError(
                f"Minecraft server exited before becoming ready on port {port} "
                f"with return code {process.returncode}."
            )
        if server_log_indicates_ready(output_path) and test_server_running(port):
            return
        time.sleep(2)
    raise TimeoutError(f"Minecraft server did not start on port {port} within {timeout_seconds}s")

def get_popen_group_kwargs():
    if os.name == "nt":
        return {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
    return {"preexec_fn": os.setsid}

def terminate_process_tree(process):
    if process is None or process.poll() is not None:
        return

    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        else:
            os.killpg(os.getpgid(process.pid), signal.SIGTERM)
    except Exception as exc:
        print(f"Failed to terminate process tree for PID {process.pid}: {exc}")

def stop_server_process(process):
    if process is None:
        return None
    if process.poll() is not None:
        return process.returncode

    try:
        if process.stdin:
            process.stdin.write("stop\n")
            process.stdin.flush()
    except Exception as exc:
        print(f"Failed to send stop command to Minecraft server: {exc}")

    try:
        return process.wait(timeout=60)
    except subprocess.TimeoutExpired:
        terminate_process_tree(process)
        try:
            return process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            return None

def launch_logged_process(command, cwd, output_path, env=None):
    output_handle = open(output_path, "w", encoding="utf-8")
    process = subprocess.Popen(
        command,
        cwd=cwd,
        env=env,
        stdin=subprocess.PIPE,
        stdout=output_handle,
        stderr=subprocess.STDOUT,
        text=True,
        **get_popen_group_kwargs(),
    )
    return process, output_handle

def clear_achievement_hunter_checkpoint():
    if os.path.exists(ACHIEVEMENT_HUNTER_CHECKPOINT):
        os.remove(ACHIEVEMENT_HUNTER_CHECKPOINT)

def copy_file_if_exists(source_path, dest_path):
    if not os.path.exists(source_path):
        return
    ensure_directory(os.path.dirname(dest_path))
    shutil.copy2(source_path, dest_path)

def copy_files_modified_since(source_root, dest_root, start_time):
    if not os.path.exists(source_root):
        return

    for root, _, files in os.walk(source_root):
        for name in files:
            source_path = os.path.join(root, name)
            try:
                modified_time = os.path.getmtime(source_path)
            except OSError:
                continue
            if modified_time + 1 < start_time:
                continue
            relative_path = os.path.relpath(source_path, source_root)
            destination_path = os.path.join(dest_root, relative_path)
            ensure_directory(os.path.dirname(destination_path))
            shutil.copy2(source_path, destination_path)

def copy_agent_artifacts(agent_name, result_dir, episode_start_time):
    agent_root = os.path.join(PROJECT_ROOT, "bots", agent_name)
    artifact_root = os.path.join(result_dir, "agent_artifacts", agent_name)
    ensure_directory(artifact_root)

    for file_name in ("memory.json", "last_profile.json", "profile.json"):
        copy_file_if_exists(
            os.path.join(agent_root, file_name),
            os.path.join(artifact_root, file_name),
        )

    copy_files_modified_since(
        os.path.join(agent_root, "histories"),
        os.path.join(artifact_root, "histories"),
        episode_start_time,
    )
    copy_files_modified_since(
        os.path.join(agent_root, "logs"),
        os.path.join(artifact_root, "logs"),
        episode_start_time,
    )

def copy_server_artifacts(server_root, result_dir):
    copy_file_if_exists(
        os.path.join(server_root, "logs", "latest.log"),
        os.path.join(result_dir, "latest.log"),
    )
    copy_file_if_exists(
        os.path.join(server_root, "server.properties"),
        os.path.join(result_dir, "server.properties"),
    )
    copy_file_if_exists(
        os.path.join(server_root, "usercache.json"),
        os.path.join(result_dir, "usercache.json"),
    )

def read_profile_name(profile_path):
    profile = load_json_file(profile_path)
    if "name" not in profile:
        raise ValueError(f"Profile file is missing a name field: {profile_path}")
    return profile["name"]

def inspect_advancement_completion(server_root, world_path, agent_name, advancement_id):
    usercache_path = os.path.join(server_root, "usercache.json")
    if not os.path.exists(usercache_path):
        return 0

    try:
        usercache = load_json_file(usercache_path)
    except Exception:
        return 0

    user_entry = next((entry for entry in usercache if entry.get("name") == agent_name), None)
    if not user_entry or "uuid" not in user_entry:
        return 0

    advancement_path = os.path.join(world_path, "advancements", f"{user_entry['uuid']}.json")
    if not os.path.exists(advancement_path):
        return 0

    try:
        advancement_data = load_json_file(advancement_path)
    except Exception:
        return 0

    return 1 if advancement_data.get(advancement_id, {}).get("done") is True else 0

def build_benchmark_task_metadata(task_data):
    return {
        "task_type": task_data.get("type"),
        "advancement_id": task_data.get("advancement_id"),
        "target": task_data.get("target"),
        "target_any_of": task_data.get("target_any_of"),
    }

def extract_result_recursive(folder_path):
    curr_score = None
    for json_file in glob.glob(os.path.join(folder_path, "**", "*.json"), recursive=True):
        score = analyze_json_file(json_file)
        if score is None:
            continue
        if curr_score is None:
            curr_score = score
        else:
            curr_score = max(curr_score, score)
    return curr_score

def prepare_benchmark_server(server_root, world_config, seed, server_port):
    if not os.path.exists(DEFAULT_BENCHMARK_TEMPLATE):
        raise FileNotFoundError(
            "Benchmark server template not found at "
            f"{DEFAULT_BENCHMARK_TEMPLATE}"
        )

    shutil.copytree(DEFAULT_BENCHMARK_TEMPLATE, server_root, dirs_exist_ok=True)
    overrides = {
        "allow-cheats": world_config.get("allow_cheats", False),
        "difficulty": world_config.get("difficulty", "normal"),
        "enable-command-block": False,
        "force-gamemode": False,
        "gamemode": world_config.get("gamemode", "survival"),
        "generate-structures": world_config.get("generate_structures", True),
        "generator-settings": "",
        "level-name": world_config.get("level_name", "world"),
        "level-seed": seed,
        "level-type": "minecraft:normal",
        "online-mode": False,
        "spawn-protection": 0,
        "server-port": server_port,
    }
    update_properties_file(os.path.join(server_root, "server.properties"), overrides)

def resolve_benchmark_score(result_dir, server_root, world_path, agent_name, task_data):
    score = extract_result_recursive(result_dir)
    if score is not None:
        return score

    if task_data.get("type") == "advancement":
        return inspect_advancement_completion(
            server_root,
            world_path,
            agent_name,
            task_data["advancement_id"],
        )

    return 0

def build_episode_settings(agent_config):
    settings_override = dict(agent_config.get("settings_override", {}))
    settings_override.setdefault("achievement_hunter", False)
    settings_override["auto_open_ui"] = False
    settings_override.setdefault("allow_insecure_coding", False)
    settings_override.setdefault("auth", "offline")
    settings_override.setdefault("host", "127.0.0.1")
    settings_override.setdefault("load_memory", False)
    return settings_override

def run_single_benchmark_episode(suite_root, task_path, task_id, task_data, agent_config, seed, world_config):
    agent_label = agent_config["label"]
    profile_path = resolve_project_path(agent_config["profile"])
    agent_name = read_profile_name(profile_path)
    level_name = world_config.get("level_name", "world")
    result_dir = os.path.join(suite_root, agent_label, f"seed_{seed}", task_id)
    ensure_directory(os.path.dirname(result_dir))
    safe_remove_tree(result_dir, suite_root)
    ensure_directory(result_dir)

    tmp_root = os.path.join(PROJECT_ROOT, "tmp")
    ensure_directory(tmp_root)
    server_root = tempfile.mkdtemp(
        prefix="benchmark_server_",
        dir=tmp_root,
    )
    world_path = os.path.join(server_root, level_name)
    server_port = choose_free_port()
    mindserver_port = choose_free_port()
    settings_override = build_episode_settings(agent_config)
    mode = "achievement_hunter" if settings_override.get("achievement_hunter") else "standard_task"

    start_dt = datetime.now().astimezone()
    episode_start_time = time.time()
    end_dt = start_dt
    node_exit_code = None
    exit_status = "failed"
    error_message = None
    server_process = None
    server_output_handle = None
    node_process = None
    node_output_handle = None

    try:
        prepare_benchmark_server(server_root, world_config, seed, server_port)

        if settings_override.get("achievement_hunter"):
            clear_achievement_hunter_checkpoint()

        server_stdout_path = os.path.join(result_dir, "server_stdout.log")
        server_process, server_output_handle = launch_logged_process(
            ["java", "-jar", "server.jar", "nogui"],
            server_root,
            server_stdout_path,
        )
        wait_for_server_ready(
            server_port,
            server_process,
            output_path=server_stdout_path,
            timeout_seconds=180,
        )

        env = os.environ.copy()
        env["LOG_ALL"] = "true"
        env["MINECRAFT_PORT"] = str(server_port)
        env["MINDSERVER_PORT"] = str(mindserver_port)
        env["SETTINGS_JSON"] = json.dumps(settings_override)
        env["TASK_SERVER_ROOT"] = server_root
        env["TASK_WORLD_PATH"] = world_path

        node_stdout_path = os.path.join(result_dir, "runner_stdout.log")
        node_process, node_output_handle = launch_logged_process(
            [
                "node",
                "main.js",
                "--task_path",
                task_path,
                "--task_id",
                task_id,
                "--profiles",
                profile_path,
            ],
            PROJECT_ROOT,
            node_stdout_path,
            env=env,
        )

        timeout_seconds = int(task_data.get("timeout", 1800)) + 600
        try:
            node_exit_code = node_process.wait(timeout=timeout_seconds)
            exit_status = "completed" if node_exit_code == 0 else "failed"
        except subprocess.TimeoutExpired:
            exit_status = "timeout"
            terminate_process_tree(node_process)
            try:
                node_exit_code = node_process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                node_exit_code = None

        time.sleep(3)
    except Exception as exc:
        error_message = str(exc)
        exit_status = "error"
        if node_process is not None:
            terminate_process_tree(node_process)
        if server_process is not None:
            terminate_process_tree(server_process)
    finally:
        end_dt = datetime.now().astimezone()
        if node_output_handle is not None:
            node_output_handle.close()
        if server_process is not None:
            stop_server_process(server_process)
        if server_output_handle is not None:
            server_output_handle.close()
        if settings_override.get("achievement_hunter"):
            clear_achievement_hunter_checkpoint()

        copy_server_artifacts(server_root, result_dir)
        copy_agent_artifacts(agent_name, result_dir, episode_start_time)

        score = resolve_benchmark_score(
            result_dir,
            server_root,
            world_path,
            agent_name,
            task_data,
        )
        task_metadata = build_benchmark_task_metadata(task_data)

        manifest = {
            "agent_label": agent_label,
            "agent_name": agent_name,
            "end_time": end_dt.isoformat(),
            "error": error_message,
            "exit_code": node_exit_code,
            "exit_status": exit_status,
            "mode": mode,
            "profile": profile_path,
            "score": score,
            "seed": seed,
            "start_time": start_dt.isoformat(),
            "task_id": task_id,
            "task_path": task_path,
        }
        manifest.update(task_metadata)
        with open(os.path.join(result_dir, "episode_manifest.json"), "w", encoding="utf-8") as file:
            json.dump(manifest, file, indent=2)

        safe_remove_tree(server_root, tmp_root)

    return manifest

def validate_benchmark_suite(config, task_data):
    if "suite_name" not in config:
        raise ValueError("benchmark_config is missing suite_name")
    if "agents" not in config or not config["agents"]:
        raise ValueError("benchmark_config must include at least one agent")
    if "world" not in config or not config["world"].get("seeds"):
        raise ValueError("benchmark_config must include a non-empty world.seeds list")

    for task_id, task_definition in task_data.items():
        task_type = task_definition.get("type")
        if task_type not in {"advancement", "inventory"}:
            raise ValueError(
                f"Benchmark task {task_id} must have type=advancement or type=inventory")
        if task_definition.get("agent_count") != 1:
            raise ValueError(f"Benchmark task {task_id} must have agent_count=1")
        if task_type == "advancement" and "advancement_id" not in task_definition:
            raise ValueError(f"Benchmark task {task_id} is missing advancement_id")
        if task_type == "inventory":
            if "target" not in task_definition and "target_any_of" not in task_definition:
                raise ValueError(
                    f"Benchmark task {task_id} must include target or target_any_of")
            if "target_any_of" in task_definition and not task_definition["target_any_of"]:
                raise ValueError(
                    f"Benchmark task {task_id} must provide a non-empty target_any_of list")

def run_benchmark_suite(config_path):
    config_path = resolve_project_path(config_path)
    config = load_json_file(config_path)
    task_path = resolve_project_path(config["task_path"])
    task_data = load_json_file(task_path)
    validate_benchmark_suite(config, task_data)

    suite_root = os.path.join(PROJECT_ROOT, "experiments", config["suite_name"])
    ensure_directory(suite_root)

    manifests = load_existing_episode_manifests(suite_root)
    for agent_config in config["agents"]:
        for seed in config["world"]["seeds"]:
            for task_id, task_definition in task_data.items():
                print(
                    f"Running benchmark episode agent={agent_config['label']} "
                    f"seed={seed} task={task_id}"
                )
                manifest = run_single_benchmark_episode(
                    suite_root,
                    task_path,
                    task_id,
                    task_definition,
                    agent_config,
                    seed,
                    config["world"],
                )
                manifests = append_or_replace_manifest(manifests, manifest)
                write_results_jsonl(os.path.join(suite_root, "results.jsonl"), manifests)
                write_summary_reports(suite_root, manifests)

def set_environment_variable_tmux_session(session_name, key, value):
    """Set an environment variable for the current process."""
    subprocess.run(["tmux", "send-keys", "-t", session_name, f"export {key}={value}", "C-m"])

def launch_parallel_experiments(task_path, 
                                num_exp, 
                                exp_name, 
                                num_agents=2, 
                                model="gpt-4o-mini",
                                api="openai",
                                num_parallel=1,
                                s3=False, 
                                bucket_name="mindcraft-experiments", 
                                template_profile="profiles/tasks/collab_profile.json", 
                                insecure_coding=False, 
                                url="http://127.0.0.1:8000/v1", 
                                max_messages=15,
                                num_examples=2, 
                                no_pruning=False,
                                block_conversation=False, 
                                run_in_tmux=True):
    
    with open(task_path, 'r', encoding='utf-8') as file:
        content = file.read()
    json_data = json.loads(content)

    task_ids = json_data.keys()

    task_type = json_data[list(task_ids)[0]]["type"]
    # split the task_ids into num_parallel groups
    task_ids = list(task_ids)
    task_ids_split = [task_ids[i::num_parallel] for i in range(num_parallel)]

    if task_type == "cooking":
        world_name = "Superflat"
    elif task_type == "techtree":
        world_name = "Forest"
    elif task_type == "construction":
        world_name = "Superflat"

    if run_in_tmux:
        servers = create_server_files("./tasks/server_data/", num_parallel, world_name=world_name)
    else:
        servers = [(f"./tasks/server_data_{i}/", 55916 + i) for i in range(num_parallel)]
    date_time = datetime.now().strftime("%m-%d_%H-%M")
    experiments_folder = f"experiments/{exp_name}_{date_time}"
    exp_name = f"{exp_name}_{date_time}"

    split_task_path = task_path.split("/")
    if len(split_task_path) > 1:
        task_path_name = split_task_path[-2]
    else:
        task_path_name = "tasks"

    s3_path = f"{bucket_name}/{task_type}/{model}/{task_path_name}/{exp_name}"

    # start wandb
    os.makedirs(experiments_folder, exist_ok=True)
    for i, server in enumerate(servers):
        launch_server_experiment(task_path, 
                                 task_ids_split[i], 
                                 num_exp, 
                                 server, 
                                 experiments_folder, 
                                 exp_name, 
                                 s3=s3, 
                                 bucket_name=bucket_name, 
                                 template_profile=template_profile, 
                                 model=model, 
                                 api=api, 
                                 insecure_coding=insecure_coding,
                                 num_agents=num_agents, 
                                 url=url, 
                                 task_type=task_type, 
                                 s3_path=s3_path, 
                                 max_messages=max_messages,
                                 num_examples=num_examples, 
                                 no_pruning=no_pruning,
                                 block_conversation=block_conversation, 
                                 run_in_tmux=run_in_tmux)
        time.sleep(5)
    
    total_num_tasks = len(task_ids)
    total_num_experiments = total_num_tasks * num_exp
    total_run = 0
    while total_run < total_num_experiments:
        results = aggregate_results([f"{experiments_folder}/{task_id}" for task_id in task_ids])
        total_run = results["total"]
        print(f"Total tasks run: {total_run}/{total_num_experiments}")
        print(results)
        results["exp_name"] = exp_name
        results["template_profile"] = template_profile
        results["model"] = model
        results["api"] = api
        results["num_agents"] = num_agents
        results["task_path"] = task_path
        results["task_type"] = task_type
        results["max_messages"] = max_messages
        results["num_examples"] = num_examples
        with open(f"{experiments_folder}/results.txt", "w") as file:
            file.write(str(results))
        if s3: 
            cmd = f"aws s3 cp {experiments_folder}/results.txt s3://{s3_path}/results.txt"
            print(cmd)
            subprocess.run(cmd.split())
        
        time.sleep(60)

def launch_server_experiment(task_path, 
                             task_ids, 
                             num_exp, 
                             server, 
                             experiments_folder,
                             exp_name="exp", 
                             num_agents=2, 
                             model="gpt-4o",
                             api="openai", 
                             s3=False, 
                             bucket_name="mindcraft-experiments", 
                             template_profile="profiles/tasks/collab_profile.json", 
                             insecure_coding=False, 
                             url="http://127.0.0.1:8000/v1", 
                             task_type="techtree", 
                             s3_path="", 
                             max_messages=15, 
                             num_examples=2, 
                             no_pruning=False,
                             block_conversation=False, 
                             run_in_tmux=True):
    
    """
    Launch a Minecraft server and run experiments on it.
    @param task_path: Path to the task file
    @param task_ids: IDs of the tasks to run
    @param num_exp: Number of experiments to run
    @param server: Tuple containing server path and port
    @param experiments_folder: Folder to store experiment results
    @param exp_name: Name of the experiment for wandb dataset
    @param num_agents: Number of agents to run
    @param model: Model to use for the agents
    @param s3: Boolean flag to enable S3 upload
    @param bucket_name: Name of the S3 bucket
    """
    server_path, server_port = server
    edit_file(os.path.join(server_path, "server.properties"), {"server-port": server_port})
    mindserver_port = server_port - 55916 + 8080
    
    # set up server and agents 
    session_name = str(server_port - 55916)
    if num_agents == 1: 
        agent_names = [f"Andy_{session_name}"]
        models = [model]
        apis = [api]
    elif num_agents == 2:
        agent_names = [f"Andy_{session_name}", f"Jill_{session_name}"]
        models = [model] * 2
        apis = [api] * 2
    else:
        # Lets use an ordered list of 10 human names.
        human_names = ["Andy", "Jill", "Bob", "Sally", "Mike", "Laura", "John", "Emma", "Tom", "Kate"]
        agent_names = []
        for i in range(num_agents):
            name = human_names[i % len(human_names)]
            agent_names.append(f"{name}_{session_name}")
        models = [model] * num_agents
        apis = [api] * num_agents
        
    make_profiles(agent_names, models, apis, template_profile=template_profile, url=url)

    agent_profiles = [f"./{agent}.json" for agent in agent_names]

    if num_agents == 1:
        agent_profiles_str = f"'[\"{agent_profiles[0]}\"]'"
    elif num_agents == 2:
        agent_profiles_str = f"'[\"{agent_profiles[0]}\", \"{agent_profiles[1]}\"]'"
    else: 
        agent_profiles_str = "'["
        for agent in agent_profiles[:-1]:
            agent_profiles_str += f'\"{agent}\", '
        agent_profiles_str += f"\"{agent_profiles[-1]}\"]'"
    print(agent_profiles_str)
    if run_in_tmux:
        print("run in tmux is true")
        launch_world(server_path, session_name="server_" + session_name, agent_names=agent_names, port=server_port)

        subprocess.run(['tmux', 'new-session', '-d', '-s', session_name], check=True) 
    # set environment variables
    if run_in_tmux:
        set_environment_variable_tmux_session(session_name, "MINECRAFT_PORT", server_port)
        set_environment_variable_tmux_session(session_name, "MINDSERVER_PORT", mindserver_port)
        set_environment_variable_tmux_session(session_name, "PROFILES", agent_profiles_str)
        set_environment_variable_tmux_session(session_name, "MAX_MESSAGES", str(max_messages))
        set_environment_variable_tmux_session(session_name, "NUM_EXAMPLES", str(num_examples))
        set_environment_variable_tmux_session(session_name, "LOG_ALL", "true")
        if insecure_coding:
            set_environment_variable_tmux_session(session_name, "INSECURE_CODING", "true")
        make_ops(agent_names, session_name)
    else: 
        agent_profiles_str = "["
        for agent in agent_profiles[:-1]:
            agent_profiles_str += f"\"{agent}\", " 
        agent_profiles_str += f"\"{agent_profiles[-1]}\"]"
        # print(agent_profiles_str)
        os.environ["PROFILES"] = agent_profiles_str
        os.environ["MAX_MESSAGES"] = str(max_messages)
        os.environ["NUM_EXAMPLES"] = str(num_examples)
        os.environ["LOG_ALL"] = "true"
    
    run_script(task_path, 
               task_ids, 
               num_exp, 
               experiments_folder, 
               agent_names, 
               server_path, 
               s3=s3, 
               s3_path=s3_path, 
               session_name=session_name, 
               run_in_tmux=run_in_tmux)

def run_script(task_path, 
               task_ids, 
               num_exp,
               experiments_folder, 
               agent_names,
               server_path,
               s3=False,
               s3_path="mindcraft-experiments",
               session_name="0",
               run_in_tmux=True,):
    script_content = ""
    for task_id in task_ids:
        # Create a separate folder for each task_id
        task_folder = os.path.join(experiments_folder, str(task_id))
        os.makedirs(task_folder, exist_ok=True)
        assert os.path.exists(task_folder), f"Directory {task_folder} was not created"
        print(f"Created directory: {task_folder}")
        
        cmd = f"node main.js --task_path \'{task_path}\' --task_id {task_id}"
        cp_cmd = f"cp {agent_names[0]}.json {server_path}bots/{agent_names[0]}/profile.json"
        for _ in range(num_exp):
            script_content += f"{cmd}\n"
            script_content += "sleep 2\n"
            for agent in agent_names:
                agent_file_path = os.path.join(task_folder, f"{agent}_{_}.json")
                script_content += f"echo 'Saving to {agent_file_path}'\n"
                cp_cmd = f"cp bots/{agent}/memory.json {agent_file_path}"
                script_content += f"echo '{cp_cmd}'\n"
                script_content += f"{cp_cmd}\n"
                script_content += "sleep 1\n"
                if s3:
                    s3_cmd = f"aws s3 cp {agent_file_path} s3://{s3_path}/{task_id}/{agent}_{_}.json"
                    script_content += f"echo 'Uploading {agent_file_path} to S3'\n"
                    script_content += f"echo '{s3_cmd}'\n"
                    script_content += f"{s3_cmd}\n"
                    script_content += "sleep 1\n"
        script_content += f"sleep 10\n"
        if s3:
            for agent in agent_names:
                script_content += f"aws s3 cp bots/{agent} s3://{s3_path}/bots/{agent} --recursive\n"

    # Create a temporary shell script file
    script_file = f"./tmp/experiment_script_{session_name}.sh"
    make_script_file_and_run(script_content, script_file, session_name=session_name, run_in_tmux=run_in_tmux)


def make_ops(agent_names, session_name):
    """Make the agents operators in the Minecraft world."""
    print('Making agents operators...')

    cmd = f"node main.js --task_path tasks/example_tasks.json --task_id debug_{len(agent_names)}_agent_timeout"

    subprocess.run(["tmux", "send-keys", "-t", session_name, cmd, "C-m"])

    time.sleep(30)

    subprocess.run(["tmux", "send-keys", "-t", "server_" + session_name, f"/op @a", "C-m"])

    agents_op = check_agent_ops(agent_names, ops_file=f"./tasks/server_data_{session_name}/ops.json")
    if agents_op:
        print("Agents are operators! You are good to go :D")
    else: 
        print("Agents are not operators! We will need to try making them operators again!")
        make_ops(agent_names, session_name)

def check_agent_ops(agent_names, ops_file="ops.json"):
    with open(ops_file, "r") as f:
        ops_data = json.load(f)
    
    ops_names = [op["name"] for op in ops_data]
    
    for agent in agent_names:
        if agent not in ops_names:
            return False 
    return True

def make_script_file_and_run(script_content, 
                             file_name, 
                             session_name="0",
                             run_in_tmux=True):
    script_dir = os.path.dirname(file_name)
    os.makedirs(script_dir, exist_ok=True)
    assert os.path.exists(script_dir), f"Script directory {script_dir} was not created"
    print(f"Created script directory: {script_dir}")

    # Call the function before writing the script file
    with open(file_name, 'w') as f:
        f.write(script_content)
    assert os.path.exists(file_name), f"Script file {file_name} was not created"

    script_file_run = "bash " + file_name

    # Execute the shell script using subprocess
    if run_in_tmux:
        subprocess.run(["tmux", "send-keys", "-t", session_name, script_file_run, "C-m"])
    else:
        subprocess.run(script_file_run.split())

def make_profiles(agent_names, models, apis, template_profile="profiles/collab_profile.json", url="http://127.0.0.1:8000/v1"):
    assert len(agent_names) == len(models)

    with open(template_profile, 'r') as f:
        content = f.read()
    
    profile = json.loads(content)

    for index in range(len(agent_names)):
        profile["name"] = agent_names[index]
        if apis[index] == "vllm":
            profile["model"] = {
                "api": "vllm",
                "model": models[index], 
                "url": url
            }
        elif apis[index] == "ollama":
            profile["model"] = {
                "api": "ollama",
                "model": models[index],
                "embedding": "ollama"
            }
        else: 
            profile["model"] = models[index]

        with open(f"{agent_names[index]}.json", 'w') as f:
            json.dump(profile, f, indent=4)

def create_server_files(source_path, num_copies, world_name="Forest"):
    """Create multiple copies of server files for parallel experiments."""
    print("Creating server files...")
    print(num_copies)
    servers = []
    for i in range(num_copies):
        dest_path = f"./tasks/server_data_{i}/"
        copy_server_files(source_path, dest_path)
        print(dest_path)
        edit_file(dest_path + "server.properties", {"server-port": 55916 + i, 
                                                    "level-name": world_name})
        # edit_server_properties_file(dest_path, 55916 + i)
        servers.append((dest_path, 55916 + i))
    return servers

def edit_file(file, content_dict):
    try:
        update_properties_file(file, content_dict)
        print(f"{file} updated with {content_dict}")
    except Exception as e:
        print(f"Error editing file {file}: {e}")

def clean_up_server_files(num_copies):
    """Delete server files from multiple locations."""
    for i in range(num_copies):
        dest_path = f"./tasks/server_data_{i}/"
        delete_server_files(dest_path)

def copy_server_files(source_path, dest_path):
    """Copy server files to the specified location."""
    try:
        shutil.copytree(source_path, dest_path)
        print(f"Server files copied to {dest_path}")
    except Exception as e:
        print(f"Error copying server files: {e}")
    time.sleep(10)

    same_files = check_same_files(source_path, dest_path)
    if not same_files:
        copy_server_files(source_path, dest_path)
        print("The destination path does not contain all the same files as the source path.")
    else:
        print("The destination path contains all the same files as the source path.")

def check_same_files(d1, d2):

    items1 = set(os.listdir(d1))
    items2 = set(os.listdir(d2))

    if items1 != items2:
        return False
    return True

def delete_server_files(dest_path):
    """Delete server files from the specified location."""
    try:
        shutil.rmtree(dest_path)
        print(f"Server files deleted from {dest_path}")
    except Exception as e:
        print(f"Error deleting server files: {e}")
    if not os.path.exists(dest_path):
        print("Server files deleted successfully.")
    # else:
    #     print("Error deleting server files.")
    #     delete_server_files(dest_path)
    

def launch_world(server_path="./tasks/server_data/", agent_names=["andy", "jill"], session_name="server", port=55916):
    """Launch the Minecraft world."""
    print(f"Launching Minecraft world with port {port}...")
    cmd = f"cd {server_path} && java -jar server.jar"
    subprocess.run(['tmux', 'new-session', '-d', '-s', session_name], check=True)
    subprocess.run(["tmux", "send-keys", "-t", session_name, cmd, "C-m"])

    for i in range(6):
        time.sleep(10)
        if test_server_running(port):
            print("Server started successfully.")
            return
        print(f"Waiting for server... ({(i + 1) * 10}s)")

    print("Server failed to start. Retrying...")
    subprocess.run(['tmux', 'kill-session', '-t', session_name], check=False)
    launch_world(server_path, agent_names, session_name, port)

def test_server_running(port=55916):
    host = 'localhost'

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.connect((host, port))
            print(f"Server is running on port {port}")
            return True
        except OSError:
            print(f"Server is not running on port {port}")
            return False

def kill_world(session_name="server"):
    """Kill the Minecraft world."""
    subprocess.run(["tmux", "send-keys", "-t", session_name, "stop", "C-m"])
    time.sleep(5)
    subprocess.run(["tmux", "kill-session", "-t", session_name])

def detach_process(command):
    """
    Launches a subprocess and detaches from it, allowing it to run independently.

    Args:
        command: A list of strings representing the command to execute, e.g., ['python', 'my_script.py'].
    """

    try:
        # Create a new process group so the child doesn't get signals intended for the parent.
        #  This is crucial for proper detachment.
        kwargs = {}
        if sys.platform == 'win32':
            kwargs.update(creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)  # Windows specific

        process = subprocess.Popen(command, 
                                   stdin=subprocess.PIPE, # Prevent stdin blocking
                                   stdout=subprocess.PIPE, # Redirect stdout
                                   stderr=subprocess.PIPE, # Redirect stderr
                                   close_fds=True,  # Close open file descriptors
                                   **kwargs)

        print(f"Process launched with PID: {process.pid}")
        return process.pid  # Return the PID of the detached process

    except FileNotFoundError:
        print(f"Error: Command not found: {command}")
        return None
    except Exception as e:
        print(f"An error occurred: {e}")
        return None

def main():
    # edit_settings("settings.js", {"profiles": ["./andy.json", "./jill.json"], "port": 55917})
    # edit_server_properties_file("../server_data/", 55917)

    parser = argparse.ArgumentParser(description='Run Minecraft AI agent experiments')
    parser.add_argument('--no_launch_world', action='store_true', help='Do not launch the Minecraft world')
    parser.add_argument('--task_path', default="tasks/multiagent_crafting_tasks.json", help='Path to the task file')
    parser.add_argument('--num_agents', default=2, type=int, help='Number of agents to run')
    parser.add_argument('--num_exp', default=1, type=int, help='Number of experiments to run')
    parser.add_argument('--num_parallel', default=1, type=int, help='Number of parallel servers to run')
    parser.add_argument('--exp_name', default="exp", help='Name of the experiment')
    parser.add_argument('--s3', action='store_true', help='Whether to upload to s3')
    parser.add_argument('--bucket_name', default="mindcraft-experiments", help='Name of the s3 bucket')
    parser.add_argument('--add_keys', action='store_true', help='Create the keys.json to match the environment variables')
    parser.add_argument('--template_profile', default="profiles/tasks/crafting_profile.json", help='Model to use for the agents')
    parser.add_argument('--model', default="gpt-4o-mini", help='Model to use for the agents')
    parser.add_argument('--api', default="openai", help='API to use for the agents')
    # parser.add_argument('--world_name', default="Forest", help='Name of the world')
    parser.add_argument('--insecure_coding', action='store_true', help='Enable insecure coding')
    parser.add_argument('--url', default="http://127.0.0.1:8000/v1")
    parser.add_argument('--max_messages', default=15, type=int, help='Maximum number of messages before summarizing')
    parser.add_argument('--num_examples', default=2, type=int, help='Maximum number of turns before summarizing')
    parser.add_argument('--no-pruning', action='store_true', help='Disable pruning of the actions')
    parser.add_argument('--block_conversation', action='store_true', help='Block conversation actions')
    parser.add_argument('--check', metavar='FOLDER_PATH', help='Check and evaluate results in the specified folder without running experiments')
    parser.add_argument('--usernames', default="", help='Comma-separated list of usernames for the agents')
    parser.add_argument('--benchmark_config', help='Run the cross-platform single-agent benchmark suite defined in the given config JSON')

    args = parser.parse_args()
    print(args)

    if args.benchmark_config:
        run_benchmark_suite(args.benchmark_config)
        return
    
    # If --check flag is provided, evaluate results in the specified folder and exit
    if args.check:
        check_folder_results(args.check)
        return
    
    if not args.no_launch_world:
        try: 
            subprocess.run(['tmux', 'kill-server'], check=True)
        except: 
            print("No tmux session to kill")
    
    # delete all server files
    if not args.no_launch_world:
        clean_up_server_files(args.num_parallel)
    if args.add_keys:
        update_keys_json()

    # change task file to include usernames
    with open(args.task_path, 'r') as f:
        content = f.read()
        task = json.loads(content) 
    # check if human count for first task is non zero
    if "human_count" in task[list(task.keys())[0]]:
        # check if human count is non zero
        human_count = task[list(task.keys())[0]]["human_count"]
        username_lst = args.usernames.replace(" ", "").split(",")
        if len(username_lst) != human_count:
            raise ValueError(f"Number of usernames provided ({len(username_lst)}) does not match human count ({human_count})")
        if human_count > 0:
            for task_id in task.keys():
                task[task_id]["usernames"] = username_lst
        # dump to task_path 
        with open(args.task_path, 'w') as f:
            json.dump(task, f, indent=4)
    
    launch_parallel_experiments(args.task_path, 
                                num_exp=args.num_exp, 
                                exp_name=args.exp_name, 
                                num_parallel=args.num_parallel, 
                                s3=args.s3, 
                                bucket_name=args.bucket_name, 
                                template_profile=args.template_profile, 
                                model=args.model, 
                                api=args.api, 
                                insecure_coding=args.insecure_coding,
                                num_agents=args.num_agents, 
                                url=args.url, 
                                max_messages=args.max_messages,
                                num_examples=args.num_examples, 
                                no_pruning=args.no_pruning, 
                                block_conversation=args.block_conversation,
                                run_in_tmux=not args.no_launch_world)

if __name__ == "__main__":
    main()
