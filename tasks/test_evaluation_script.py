import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name('evaluation_script.py')
SPEC = importlib.util.spec_from_file_location('evaluation_script', MODULE_PATH)
evaluation_script = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evaluation_script)


class ValidateBenchmarkSuiteTests(unittest.TestCase):
    def make_config(self):
        return {
            "suite_name": "test_suite",
            "agents": [{"label": "baseline_andy", "profile": "./andy.json"}],
            "world": {"seeds": [12345]},
        }

    def test_accepts_valid_inventory_task(self):
        task_data = {
            "diamonds": {
                "type": "inventory",
                "goal": "Acquire diamonds. Have a diamond in the inventory.",
                "target": "diamond",
                "agent_count": 1,
                "timeout": 1200,
            }
        }

        evaluation_script.validate_benchmark_suite(self.make_config(), task_data)

    def test_rejects_inventory_task_without_target(self):
        task_data = {
            "diamonds": {
                "type": "inventory",
                "goal": "Acquire diamonds. Have a diamond in the inventory.",
                "agent_count": 1,
                "timeout": 1200,
            }
        }

        with self.assertRaisesRegex(
                ValueError, "must include target or target_any_of"):
            evaluation_script.validate_benchmark_suite(self.make_config(), task_data)

    def test_accepts_valid_advancement_task(self):
        task_data = {
            "stone_age": {
                "type": "advancement",
                "goal": "Obtain Stone Age.",
                "advancement_id": "minecraft:story/mine_stone",
                "agent_count": 1,
                "timeout": 1200,
            }
        }

        evaluation_script.validate_benchmark_suite(self.make_config(), task_data)


if __name__ == '__main__':
    unittest.main()
