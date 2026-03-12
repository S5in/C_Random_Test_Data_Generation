/**
 * demo_iteration2.c
 *
 * Demonstration file for C Random Test Data Generator — Iteration 2
 * ===================================================================
 * Place your cursor on any function below and run "Generate Tests".
 *
 * Goal 1 — Pointer / array / struct parameters:
 *   scale_value()   pointer param  (int *)
 *   sum_array()     array param    (int[])
 *   distance()      struct param   (Point)
 *
 * Goal 2 — Smarter BVA for non-int types:
 *   safe_divide()   float boundary (includes ±∞, NaN guards)
 *   safe_strlen()   size_t + char* (unsigned boundary: 0 and SIZE_MAX)
 *   count_char()    char boundary  (0x00, 0x7F, 0x80, 0xFF)
 *
 * Goal 3 — Test density (standard / thorough / minimal):
 *   clamp()         3-param int function — try all three density modes
 *   add()           simple 2-param int   — baseline density comparison
 *
 * Goal 4 — Preview UI (fix verified by this commit):
 *   Open any function → Fill Expected Values → Preview tab
 *   Syntax highlighting now renders correctly (no raw class="cmt"> text)
 *
 * Goal 5 — Diagnostics:
 *   See OUTPUT panel → "C Test Generator" for per-param boundary log
 */

#include <stddef.h>
#include <string.h>
#include <math.h>

/* ------------------------------------------------------------------
 * Struct used by Goal 1 (struct parameter)
 * ------------------------------------------------------------------ */
typedef struct {
    int x;
    int y;
} Point;

/* ------------------------------------------------------------------
 * Goal 1a — Pointer parameter
 * Scale every element of a single-element data value in-place.
 * ------------------------------------------------------------------ */
void scale_value(int *data, int factor)
{
    if (data == NULL) { return; }
    *data = *data * factor;
}

/* ------------------------------------------------------------------
 * Goal 1b — Array parameter
 * Return the sum of the first `size` elements of arr[].
 * ------------------------------------------------------------------ */
int sum_array(int arr[], int size)
{
    int total = 0;
    for (int i = 0; i < size; i++) {
        total += arr[i];
    }
    return total;
}

/* ------------------------------------------------------------------
 * Goal 1c — Struct parameter
 * Return Manhattan distance between two points.
 * ------------------------------------------------------------------ */
int distance(Point p1, Point p2)
{
    int dx = p1.x - p2.x;
    int dy = p1.y - p2.y;
    if (dx < 0) { dx = -dx; }
    if (dy < 0) { dy = -dy; }
    return dx + dy;
}

/* ------------------------------------------------------------------
 * Goal 2a — float parameter (smarter BVA: ±FLT_MAX, ±0.0f, ±∞)
 * Safe integer division returning 0.0f when denominator is 0.
 * ------------------------------------------------------------------ */
float safe_divide(float numerator, float denominator)
{
    if (denominator == 0.0f) { return 0.0f; }
    return numerator / denominator;
}

/* ------------------------------------------------------------------
 * Goal 2b — size_t parameter (smarter BVA: 0, 1, SIZE_MAX)
 * Return the length of str, capped at max_len.
 * ------------------------------------------------------------------ */
size_t safe_strlen(const char *str, size_t max_len)
{
    if (str == NULL) { return 0; }
    size_t len = 0;
    while (len < max_len && str[len] != '\0') {
        len++;
    }
    return len;
}

/* ------------------------------------------------------------------
 * Goal 2c — char parameter (smarter BVA: '\0', 'A', '\x7f', '\xff')
 * Count occurrences of `target` in `str`.
 * ------------------------------------------------------------------ */
int count_char(const char *str, char target)
{
    if (str == NULL) { return 0; }
    int count = 0;
    for (size_t i = 0; str[i] != '\0'; i++) {
        if (str[i] == target) { count++; }
    }
    return count;
}

/* ------------------------------------------------------------------
 * Goal 3a — 3-param int (test density demo: minimal=3, standard=9,
 *            thorough=~27 boundary combinations)
 * Clamp value to [min_val, max_val].
 * ------------------------------------------------------------------ */
int clamp(int value, int min_val, int max_val)
{
    if (value < min_val) { return min_val; }
    if (value > max_val) { return max_val; }
    return value;
}

/* ------------------------------------------------------------------
 * Goal 3b — simple 2-param baseline for density comparison
 * ------------------------------------------------------------------ */
int add(int a, int b)
{
    return a + b;
}
