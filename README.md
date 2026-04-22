# Vo1dwalker (v3.0.0)
A VS Code extension that **automatically generates Google Test (GTest) test cases** for your C functions using **Boundary Value Analysis (BVA)**.
Right-click any C function → get a full set of boundary tests instantly. No test-writing boilerplate.
---
## ✨ Features
- **One-click test generation** — Place your cursor inside any C function and press `Ctrl+Shift+T` (or right-click → *Generate Tests for This Function*)
- **Boundary Value Analysis** — Automatically generates test cases for `INT_MIN`, `INT_MAX`, `0`, boundary ±1 values, float/double infinities, and more
- **Supports all C primitive types** — `int`, `unsigned int`, `long`, `short`, `float`, `double`, `char`, `size_t`, and their variants
- **Pointer, array & struct support** — Generates `NULL` / valid-pointer tests, single-element / typical array tests, and zero-initialized / extreme struct tests
- **Header file support** — Parse `.h` header files to extract function prototypes and generate tests directly from them
- **Global variable awareness** — Detects and tests global variables used by your function
- **Test density control** — Choose `minimal`, `standard`, or `exhaustive` via the `voidwalker.testDensity` setting
- **Interactive expected values** — Fill in expected results through a built-in webview UI, or skip and fill them manually later
- **Custom Tests tab** — Add your own test cases with custom parameter values; struct parameters get per-field inputs; remove any custom test with the ✖ button
- **Preview tab** — See the full generated C++ test code with syntax highlighting before saving
- **Test checkboxes** — Select/deselect individual test cases before saving; unchecked tests are commented out
- **CMake integration** — Automatically generates `CMakeLists.txt` alongside your tests
- **Automatic `main()` handling** — Source files with a `main()` function are automatically handled; the extension renames it at compile time so GoogleTest's entry point works correctly
- **Build & Run** — Build and execute tests directly from VS Code with one click
- **VS Code Problems panel** — Build errors from g++/cmake are parsed and shown with file/line info
- **Output Channel logging** — All extension activity appears in the "Voidwalker" output panel
- **Cross-platform** — Works on Windows, Linux, and WSL
---
## 🆕 What's New in v3.0.0
- **Header file (`.h`) parsing support** — The extension can now parse `.h` header files to extract function declarations/prototypes and generate tests from them, not just `.c` source files.
- **Rebranded to Vo1dwalker** — The extension has been renamed from "S5in C BVA Test Generator" to "Vo1dwalker" for a cleaner, more memorable identity.
- **VS Code Marketplace publish pipeline** — Added GitHub Actions CI/CD workflow for automated packaging and publishing via `vsce`.
- **Polished metadata** — Updated categories, keywords, and descriptions for better discoverability on the Marketplace.
---
## 🆕 What's New in v2.0.0
### Goal 1 — Pointer, Array & Struct support
```c
// All of these parameter types are now fully supported:
int func_with_ptr(int *ptr);              // pointer: NULL + valid-ptr tests
int func_with_arr(int arr[], int size);   // array: single-element + typical
int func_with_struct(struct Point p);     // struct: zero-init + extreme values
```
### Goal 2 — Smarter Boundary Values
- `float` / `double` — now tests `+∞`, `−∞`, `FLT_EPSILON`, `DBL_EPSILON`
- `char` — adds `'\0'` (null terminator) and `'A'` (printable) boundary classes
- `size_t` — boundaries `0`, `1`, `10`, `SIZE_MAX`
- Correct assertion macros: `EXPECT_FLOAT_EQ` / `EXPECT_DOUBLE_EQ` for floating-point returns
### Goal 3 — Test Density Configuration
Add to your VS Code `settings.json` or workspace settings:
```json
{
  "voidwalker.testDensity": "standard"
}
```
| Value | Tests per parameter | Description |
|-------|---------------------|-------------|
| `minimal`    | min, max, zero | Fewest tests |
| `standard`   | min, min+1, max-1, max | **Default** — full BVA |
| `exhaustive` | all boundary classes | Includes infinities, near-zero, overflow |
### Goal 4 — UI Improvements
- **3-tab webview** — Boundary Tests, Custom Tests, and Preview tabs
- **Preview tab** in the webview with syntax-highlighted generated code
- **Checkboxes** to include/exclude individual tests before saving
- **Stats bar** — "Tests generated / Selected / Custom"
### Goal 5 — Better Error Reporting
- Build errors appear in the **Problems** panel (clickable, with file + line)
- "Voidwalker" **Output Channel** for all log messages
- Clearer error: _"Place your cursor inside a C function body and try again."_
---
## 📋 Prerequisites
The extension itself installs with **zero dependencies** — just install and go. However, to **build and run** the generated tests, your system needs:
### Required
| Tool | Why | Install |
|------|-----|---------|
| **C/C++ Compiler** (gcc/g++) | Compiles the generated test files | See below |
| **CMake** (≥ 3.14) | Builds the test project | See below |
| **Google Test** (GTest) | The testing framework used by generated tests | See below |
### Installation by OS
<details>
<summary><strong>🐧 Ubuntu / Debian (including WSL)</strong></summary>

```bash
sudo apt update
sudo apt install -y build-essential cmake libgtest-dev
# Build and install GTest (required on Ubuntu)
cd /usr/src/gtest
sudo cmake .
sudo make
sudo cp lib/*.a /usr/lib/
```
</details>

<details>
<summary><strong>🍎 macOS</strong></summary>

```bash
brew install cmake googletest
```
</details>

<details>
<summary><strong>🪟 Windows (with WSL — recommended)</strong></summary>

1. Install [WSL](https://learn.microsoft.com/en-us/windows/wsl/install): `wsl --install`
2. Inside WSL, follow the Ubuntu instructions above
3. Open your project in VS Code with the [Remote - WSL](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-wsl) extension
</details>

### ✅ Verify your setup
Open a terminal and run:
```bash
g++ --version     # Should print version info
cmake --version   # Should print 3.14 or higher
ls /usr/lib/libgtest*.a 2>/dev/null || ls /usr/local/lib/libgtest*.a 2>/dev/null
                  # Should list libgtest.a and libgtest_main.a
```
If all three commands produce output, you're ready to go.
> **Tip:** You can also verify everything from within VS Code — click the **Prerequisites** status bar item at the bottom, or open the Command Palette (`Ctrl+Shift+P`) and run **"Voidwalker: Check Prerequisites"**. A dialog will show the status of each tool and install instructions if anything is missing.
---
## 🚀 Installation
### From the VS Code Marketplace (Recommended)
1. Open **VS Code**
2. Go to the **Extensions** sidebar (`Ctrl+Shift+X`)
3. Search for **"Voidwalker"** in the search bar
4. Click **Install** on the extension by **S5in**
5. You're ready to go — no reload needed!
> **Tip:** You can also open the Command Palette (`Ctrl+Shift+P`), type `ext install S5in.voidwalker`, and press Enter.
### From the terminal
```bash
code --install-extension S5in.voidwalker
```
---
## 📖 How to Use
### Step 1: Open a C file
Open any `.c` or `.h` file in VS Code.
### Step 2: Generate tests
Place your cursor **inside** a function and do one of:
- Press **`Ctrl+Shift+T`** (`Cmd+Shift+T` on Mac)
- Right-click → **"Generate Tests for This Function"**
- Command Palette (`Ctrl+Shift+P`) → **"Voidwalker: Generate Tests for This Function"**
### Step 3: The extension creates two files next to your `.c` file
```
your_project/
├── math.c                  ← your source file
├── add_test.cpp            ← generated test file (for function "add")
├── CMakeLists.txt          ← generated build configuration
└── build/                  ← created when you build
    └── add_tests           ← compiled test executable
```
### Step 4: Fill expected values & customize tests
After generation, a popup offers three choices:
- **Fill Expected Values** — Opens the full webview panel (see below)
- **Build & Run** — Skips the webview and immediately builds and runs the tests
- **View Tests** — Opens the generated test file directly in the editor

Choosing **Fill Expected Values** opens a rich webview panel with three tabs:
- **🧪 Boundary Tests** — All auto-generated test cases displayed as cards. Each card shows the test name, read-only input values, and an **Expected result** field. Use the checkbox on each card to include or exclude it, or toggle **Select/Deselect All** at the top.
  - Enter a **numeric value** (e.g., `42`, `-100`, `0.5`)
  - For `float`/`double` returns, use `INFINITY`, `NAN`, or exact values like `1.5f`
  - Leave blank to keep the `FAIL()` placeholder and fill in manually later
- **➕ Custom Tests** — Add your own test cases with custom parameter values and expected results. Struct parameters get per-field inputs. Remove any custom test with the ✖ button.
- **👁️ Preview** — See the full generated C++ test file with syntax highlighting before saving.

A **stats bar** at the top tracks: *Tests generated / Selected / Custom*.

When you're ready, click one of three buttons:
| Button | What it does |
|--------|--------------|
| 🚀 **Save & Build & Run** | Save all expected values and custom tests, then immediately build and run |
| 💾 **Save Only** | Save changes without building |
| ⏭️ **Skip** | Close the panel without saving (tests keep `FAIL()` placeholders) |
### Step 5: Build & Run
Build and run can happen automatically (from the popup or webview), or you can trigger it manually at any time:
- Command Palette (`Ctrl+Shift+P`) → **"Voidwalker: Build & Run Tests"**

The **"Voidwalker" output channel** shows the full build log and test results. Any build errors are also surfaced in the **VS Code Problems panel** with clickable file + line info.
---
## 🧪 Example
Given this C function:
```c
int add(int x, int y) {
    return x + y;
}
```
The extension generates tests like:
```cpp
TEST(addTest, Baseline_AllZero) {
    // Arrange
    int x = 0;
    int y = 0;
    // Act
    int result = add(x, y);
    // Assert
    // TODO: Provide expected value
    FAIL() << "Expected value needed. Got: " << result;
}
TEST(addTest, Param_x_Min) {
    // Arrange
    int x = INT_MIN;
    int y = 0;
    // Act
    int result = add(x, y);
    // ...
}
```
Example with a pointer parameter:
```cpp
// For: int deref(int *ptr)
TEST(derefTest, Param_ptr_NullPointer) {
    int *ptr = NULL;
    int result = deref(ptr);
    // ...
}
TEST(derefTest, Param_ptr_ValidPointer) {
    int ptr_val = 0;
    int *ptr = &ptr_val;
    int result = deref(ptr);
    // ...
}
```
---
## ⌨️ Commands
| Command | Shortcut | Description |
|---------|----------|-------------|
| **Voidwalker: Generate Tests for This Function** | `Ctrl+Shift+T` | Generate boundary tests for the function at cursor |
| **Voidwalker: Build & Run Tests** | — | Build and execute the generated tests |
| **Voidwalker: Clean Build Directory** | — | Remove the `build/` directory |
| **Voidwalker: Check Prerequisites** | — | Verify that g++, CMake ≥ 3.14, and GTest are installed; shows install instructions if anything is missing |
---
## ⚙️ Configuration
| Setting | Default | Options | Description |
|---------|---------|---------|-------------|
| `voidwalker.testDensity` | `standard` | `minimal`, `standard`, `exhaustive` | Controls how many boundary test cases are generated per function |
| `voidwalker.numberOfRandomValues` | `5` | any number ≥ 0 | Number of additional random test values per parameter |
| `voidwalker.enableBoundaryNaN` | `true` | `true`/`false` | Include NaN boundary values for float/double parameters |
| `voidwalker.enableBoundaryInfinity` | `true` | `true`/`false` | Include ±Infinity boundary values for float/double parameters |
| `voidwalker.enableBoundaryZero` | `true` | `true`/`false` | Include zero/near-zero boundary values |
| `voidwalker.outputFormat` | `googletest` | `googletest`, `plain` | Output format for generated test files |
| `voidwalker.includeNegativeTests` | `true` | `true`/`false` | Generate NULL pointer / negative-input test cases |
| `voidwalker.testFileNamingPattern` | `test_{filename}` | any string | Pattern for generated test file name |
---
## ⚠️ Important Notes
- **One function at a time** — Place your cursor inside the function you want to test. The extension tests the function at the cursor position, not the entire file.
- **C and header files** — The extension activates for `.c` files and `.h` header files. It generates `.cpp` test files (Google Test is C++).
- **CMakeLists.txt is overwritten** — Each time you generate tests, the `CMakeLists.txt` in that directory is regenerated. If you've customized it, back it up first.
- **Functions with 7+ parameters** — The extension will warn you about large parameter counts (exponential test combinations). Consider refactoring to use structs.
- **Files with `main()`** — If your `.c` file has a `main()` function, the extension automatically handles the conflict with GoogleTest's entry point. No manual changes needed.
---
## 📦 Release Notes
### 3.0.0 — Iteration 3
- **Header file (`.h`) parsing support** — The extension can now parse `.h` header files to extract function declarations/prototypes and generate tests from them, not just `.c` source files.
- **Rebranded to Vo1dwalker** — The extension has been renamed from "S5in C BVA Test Generator" to "Vo1dwalker" for a cleaner, more memorable identity.
- **VS Code Marketplace publish pipeline** — Added GitHub Actions CI/CD workflow for automated packaging and publishing via `vsce`.
- **Polished metadata** — Updated categories, keywords, and descriptions for better discoverability on the Marketplace.
### 2.0.3 — Patch
- Output pointer parameters in void-return functions are now treated as output params in custom tests: the form no longer asks for an input value — it auto-declares the buffer and asserts its value after the call
- Status bar "Prerequisites" item now appears immediately on startup (activation event changed to `onStartupFinished`)
- Prerequisite detection now works when VS Code runs as a native Windows app with tools installed inside WSL (wsl.exe fallback added for g++, cmake, and GTest path checks)
### 2.0.2 — Patch
- Add `Check Prerequisites` command to verify g++, CMake ≥ 3.14, and GTest
- Fix command IDs to match publisher name (`s5in-c-bva-test-generator.*`)
- Fix WASM grammar loading to pass file path directly instead of a Buffer
- Silent prerequisite check on extension activation

### 2.0.1 — Patch
- Automatic `main()` conflict resolution: source files containing `main()` no longer conflict with GoogleTest's entry point
### 2.0.0 — Iteration 2
- Pointer, array & struct parameter support
- Smarter boundary values (`size_t`, `char` null/printable, `float`/`double` infinity, overflow)
- Test density configuration setting (`minimal` / `standard` / `exhaustive`)
- Custom Tests tab — add your own test cases with per-field struct inputs
- Preview tab with syntax highlighting in webview
- Checkboxes to include/exclude tests before saving
- 3-choice notification popup (Fill Expected Values / Build & Run / View Tests)
- VS Code Problems panel integration for build errors
- Output Channel logging
- Fixed assertion macros for float/double return types
### 1.0.0 — Iteration 1
- Initial release
- Boundary value analysis for all C primitive types
- Google Test code generation with `CMakeLists.txt`
- Interactive expected value webview
- Build & Run integration
- Windows, Linux, and WSL support
---
## 📝 License
University project — 3rd year.
