# C Test Generator — Boundary Value Analysis for C Functions

A VS Code extension that **automatically generates Google Test (GTest) test cases** for C functions using **Boundary Value Analysis (BVA)**. Place your cursor inside any C function, press a shortcut, and get a full set of boundary tests instantly — no boilerplate needed.

---

## Quick Start

1. **Install** the `.vsix` file (see [Installation](#installation))
2. **Open** any `.c` file in VS Code
3. **Press `Ctrl+Shift+T`** with your cursor inside a C function

That's it — the extension generates test files and a `CMakeLists.txt` right next to your source file.

---

## Installation

### From `.vsix` File (GitHub Releases)

1. Go to the [Releases page](https://github.com/S5in/C_Random_Test_Data_Generation/releases) of this repository
2. Download the latest `random-test-data-generation-x.x.x.vsix` file
3. Open VS Code
4. Go to the **Extensions** sidebar (`Ctrl+Shift+X`)
5. Click the `⋯` menu (top-right of the Extensions panel)
6. Select **"Install from VSIX..."**
7. Browse to the downloaded `.vsix` file and select it
8. Reload VS Code when prompted

**Or install from the terminal:**

```bash
code --install-extension random-test-data-generation-2.0.0.vsix
```

### Verify Installation

1. Open VS Code
2. Go to the **Extensions** sidebar (`Ctrl+Shift+X`)
3. Search for **"Random Test Data Generation"**
4. The extension should appear with a green ✓ showing it is installed

---

## Prerequisites (for building/running generated tests)

The extension itself installs with **zero dependencies** — just install the `.vsix` and go. However, to **build and run** the generated tests, your system needs:

| Tool | Why | Minimum Version |
|------|-----|----------------|
| **C/C++ Compiler** (gcc/g++) | Compiles the generated test files | Any modern version |
| **CMake** | Builds the test project | ≥ 3.14 |
| **Google Test** (GTest) | The testing framework used by generated tests | Any modern version |

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

If both commands work, you're ready to build and run your generated tests.

---

## How to Use

### Step 1: Open a C File

Open any `.c` file in VS Code.

### Step 2: Generate Tests

Place your cursor **inside** a function body, then use one of these three methods:

- **Keyboard shortcut:** `Ctrl+Shift+T` (`Cmd+Shift+T` on Mac)
- **Right-click context menu:** → "Generate Tests for This Function"
- **Command Palette** (`Ctrl+Shift+P`) → "C Test Generator: Generate Tests for This Function"

### Step 3: Fill in Expected Values

A webview panel opens where you can enter expected return values for each generated test case:

- Enter a **numeric value** (e.g., `42`, `-100`, `0.5`)
- Type **`overflow`** or **`undefined`** for edge cases with no defined result
- Type **`skip`** to leave a test as `FAIL()` and fill it in manually later
- Use the **Preview tab** to review the full generated C++ code with syntax highlighting
- **Uncheck** individual test cases to exclude them from the saved file
- The **stats bar** shows: *Tests generated / Selected / Custom*

### Step 4: Review Generated Files

The extension creates these files next to your `.c` source file:

```
your_project/
├── math.c              ← your source file
├── add_test.cpp        ← generated test file
├── CMakeLists.txt      ← generated build configuration
└── build/              ← created when you build
    └── add_tests       ← compiled test executable
```

### Step 5: Build & Run Tests

- Click **"Build & Run"** when prompted after generation
- Or use the Command Palette → **"C Test Generator: Build & Run Tests"**
- Test results appear in the **Output** panel (pass/fail status for each test)
- Build errors appear in the **Problems** panel (clickable links with file + line info)

---

## Example

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
    // Assert
    EXPECT_EQ(result, /* your expected value */);
}
```

For a pointer parameter (`int deref(int *ptr)`), the extension also generates NULL and valid-pointer tests:

```cpp
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

## Commands Reference

| Command | Shortcut | Description |
|---------|----------|-------------|
| **Generate Tests for This Function** | `Ctrl+Shift+T` | Generate boundary tests for the function at cursor |
| **Build & Run Tests** | — | Build and execute the generated tests |
| **Clean Build Directory** | — | Remove the `build/` directory |

---

## Configuration

### Test Density Setting

Control how many boundary test cases are generated per parameter via `cTestGenerator.testDensity`:

| Value | Tests per parameter | Description |
|-------|--------------------|----|
| `minimal` | min, max, zero | Fewest tests — fast smoke check |
| `standard` | min, min+1, max-1, max | **Default** — full BVA suite |
| `exhaustive` | all boundary classes | Includes infinities, near-zero, overflow |

Add to your VS Code `settings.json` (or workspace settings):

```json
{
  "cTestGenerator.testDensity": "standard"
}
```

---

## What's New in v2.0.0 (Iteration 2)

| Goal | Change |
|------|--------|
| **Pointer, array & struct support** | Generates `NULL`/valid-pointer tests, single-element/typical array tests, zero-init/extreme struct tests |
| **Smarter boundary values** | `float`/`double` infinity & epsilon, `size_t` `SIZE_MAX`, `char` null terminator & printable boundary |
| **Test density configuration** | `minimal` / `standard` / `exhaustive` setting |
| **Preview tab & checkboxes** | Review generated code with syntax highlighting; include/exclude individual tests before saving |
| **Problems panel integration** | Build errors from g++/cmake shown with file + line info; Output Channel for all log messages |

---

## Supported C Types

| Category | Types |
|----------|-------|
| **Primitive** | `int`, `unsigned int`, `long`, `long long`, `short`, `float`, `double`, `char`, `size_t` |
| **Pointer** | `int *`, `float *`, `char *`, and pointers to any supported primitive |
| **Array** | `int arr[]`, `int arr[10]`, and arrays of any supported primitive |
| **Struct** | `struct Point p` — zero-initialized and extreme-field variants |

---

## Important Notes

- **One function at a time** — The extension tests the function where your cursor is, not the entire file.
- **C files only** — The extension activates only for `.c` files; it generates `.cpp` test files (Google Test is C++).
- **CMakeLists.txt is overwritten** — Each generation regenerates the `CMakeLists.txt` in that directory. Back it up first if you have customizations.
- **Functions with 7+ parameters** — The extension will warn you about large parameter counts (exponential test combinations). Consider refactoring to use structs.

---

## Release Notes

### 2.0.0 — Iteration 2

- Pointer, array & struct parameter support
- Smarter boundary values (`size_t`, `char` null/printable, `float`/`double` infinity, overflow)
- Test density configuration setting (`minimal` / `standard` / `exhaustive`)
- Preview tab with syntax highlighting in webview
- Checkboxes to include/exclude tests before saving
- VS Code Problems panel integration for build errors
- Output Channel logging
- Fixed assertion macros for `float`/`double` return types (`EXPECT_FLOAT_EQ` / `EXPECT_DOUBLE_EQ`)

### 1.0.0 — Iteration 1

- Initial release
- Boundary value analysis for all C primitive types
- Google Test code generation with `CMakeLists.txt`
- Interactive expected value webview
- Build & Run integration
- Windows, Linux, and WSL support

---

## License

University project — 3rd year.
