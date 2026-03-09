# C Test Generator – Boundary Value Analysis (v2.0.0)

A VS Code extension that **automatically generates Google Test (GTest) test cases** for your C functions using **Boundary Value Analysis (BVA)**.

Right-click any C function → get a full set of boundary tests instantly. No test-writing boilerplate.

---

## ✨ Features

- **One-click test generation** — Place your cursor inside any C function and press `Ctrl+Shift+T` (or right-click → *Generate Tests for This Function*)
- **Boundary Value Analysis** — Automatically generates test cases for `INT_MIN`, `INT_MAX`, `0`, boundary ±1 values, float/double infinities, and more
- **Supports all C primitive types** — `int`, `unsigned int`, `long`, `short`, `float`, `double`, `char`, `size_t`, and their variants
- **Pointer, array & struct support** — Generates `NULL` / valid-pointer tests, single-element / typical array tests, and zero-initialized / extreme struct tests (new in v2.0.0)
- **Global variable awareness** — Detects and tests global variables used by your function
- **Test density control** — Choose `minimal`, `standard`, or `exhaustive` via the `cTestGenerator.testDensity` setting (new in v2.0.0)
- **Interactive expected values** — Fill in expected results through a built-in webview UI, or skip and fill them manually later
- **Preview tab** — See the full generated C++ test code with syntax highlighting before saving (new in v2.0.0)
- **Test checkboxes** — Select/deselect individual test cases before saving; unchecked tests are commented out (new in v2.0.0)
- **CMake integration** — Automatically generates `CMakeLists.txt` alongside your tests
- **Build & Run** — Build and execute tests directly from VS Code with one click
- **VS Code Problems panel** — Build errors from g++/cmake are parsed and shown with file/line info (new in v2.0.0)
- **Output Channel logging** — All extension activity appears in the "C Test Generator" output panel (new in v2.0.0)
- **Cross-platform** — Works on Windows, Linux, and WSL

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
  "cTestGenerator.testDensity": "standard"
}
```

| Value | Tests per parameter | Description |
|-------|--------------------|-|
| `minimal`    | min, max, zero | Fewest tests |
| `standard`   | min, min+1, max-1, max | **Default** — full BVA |
| `exhaustive` | all boundary classes | Includes infinities, near-zero, overflow |

### Goal 4 — UI Improvements
- **Preview tab** in the webview with syntax-highlighted generated code
- **Checkboxes** to include/exclude individual tests before saving
- **Stats bar** — "Tests generated / Selected / Custom"

### Goal 5 — Better Error Reporting
- Build errors appear in the **Problems** panel (clickable, with file + line)
- "C Test Generator" **Output Channel** for all log messages
- Clearer error: _"Place your cursor inside a C function body and try again."_

---

## 📋 Prerequisites

The extension itself installs with **zero dependencies** — just install the `.vsix` and go. However, to **build and run** the generated tests, your system needs:

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
```

If both commands work, you're ready to go.

---

## 🚀 Installation

### From `.vsix` file

1. Download the `.vsix` file (from GitHub Releases or provided directly)
2. Open VS Code
3. Go to **Extensions** sidebar (`Ctrl+Shift+X`)
4. Click the `⋯` menu (top-right of the Extensions panel)
5. Select **"Install from VSIX..."**
6. Choose the downloaded `.vsix` file
7. Reload VS Code when prompted

Alternatively, from the terminal:

```bash
code --install-extension random-test-data-generation-2.0.0.vsix
```

---

## 📖 How to Use

### Step 1: Open a C file

Open any `.c` file in VS Code.

### Step 2: Generate tests

Place your cursor **inside** a function and do one of:

- Press **`Ctrl+Shift+T`** (`Cmd+Shift+T` on Mac)
- Right-click → **"Generate Tests for This Function"**
- Command Palette (`Ctrl+Shift+P`) → **"C Test Generator: Generate Tests for This Function"**

### Step 3: The extension creates two files next to your `.c` file

```
your_project/
├── math.c                  ← your source file
├── add_test.cpp            ← generated test file (for function "add")
├── CMakeLists.txt          ← generated build configuration
└── build/                  ← created when you build
    └── add_tests           ← compiled test executable
```

### Step 4: Fill expected values (optional)

After generation, you'll be prompted to fill in expected return values for each test case. You can:

- Enter a **numeric value** (e.g., `42`, `-100`, `0.5`)
- Type **`overflow`** or **`undefined`** for edge cases
- Type **`skip`** to leave a test as `FAIL()` and fill it in manually later
- Use the **Preview tab** to review the generated code
- **Uncheck** any test case to exclude it from the saved file

### Step 5: Build & Run

Click **"Build & Run"** when prompted, or use:

- Command Palette → **"C Test Generator: Build & Run Tests"**

The output panel will show test results with pass/fail status.

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

// ... more boundary combinations
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
| **Generate Tests for This Function** | `Ctrl+Shift+T` | Generate boundary tests for the function at cursor |
| **Build & Run Tests** | — | Build and execute the generated tests |
| **Clean Build Directory** | — | Remove the `build/` directory |

---

## ⚙️ Configuration

| Setting | Default | Options | Description |
|---------|---------|---------|-------------|
| `cTestGenerator.testDensity` | `standard` | `minimal`, `standard`, `exhaustive` | Controls how many boundary test cases are generated per function |

---

## ⚠️ Important Notes

- **One function at a time** — Place your cursor inside the function you want to test. The extension tests the function at the cursor position, not the entire file.
- **C files only** — The extension activates only for `.c` files. It generates `.cpp` test files (Google Test is C++).
- **CMakeLists.txt is overwritten** — Each time you generate tests, the `CMakeLists.txt` in that directory is regenerated. If you've customized it, back it up first.
- **Functions with 7+ parameters** — The extension will warn you about large parameter counts (exponential test combinations). Consider refactoring to use structs.

---

## 📦 Release Notes

### 2.0.0 — Iteration 2

- Pointer, array & struct parameter support
- Smarter boundary values (size_t, char null/printable, float/double infinity, overflow)
- Test density configuration setting (`minimal` / `standard` / `exhaustive`)
- Preview tab with syntax highlighting in webview
- Checkboxes to include/exclude tests before saving
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
