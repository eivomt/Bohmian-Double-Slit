import math
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from scipy.interpolate import RectBivariateSpline


# -----------------------------
# CSV loader + grid rebuild
# -----------------------------
def load_q_field_csv(csv_path: str, N: int, delimiter: str = ","):
    """
    Loads rows [x_phys, y_phys, Q] exported from MATLAB with:
        data = [X(:), Y(:), Q(:)];
        writematrix(data, 'Q.csv')

    Returns:
      x1d (N,), y1d (N,), Qgrid (N,N), hx, hy, x0, y0
    where Qgrid[j,i] corresponds to (x1d[i], y1d[j]).
    """
    arr = np.loadtxt(csv_path, delimiter=delimiter)
    if arr.ndim != 2 or arr.shape[1] < 3:
        raise ValueError("CSV must have 3 columns: x, y, Q")

    x_phys = arr[:, 0]
    y_phys = arr[:, 1]
    q_vals = arr[:, 2]

    if x_phys.size != N * N:
        raise ValueError(f"Expected {N*N} rows for N={N}, got {x_phys.size}")

    x1d = np.sort(np.unique(x_phys))
    y1d = np.sort(np.unique(y_phys))
    if x1d.size != N or y1d.size != N:
        raise ValueError(
            f"unique(x)={x1d.size}, unique(y)={y1d.size}, expected N={N}. "
            "Check N matches what you used in MATLAB."
        )

    hx = (x1d[-1] - x1d[0]) / (N - 1)
    hy = (y1d[-1] - y1d[0]) / (N - 1)
    x0, y0 = float(x1d[0]), float(y1d[0])

    # Robust reconstruction: map each row to nearest (ix,iy)
    ix = np.rint((x_phys - x0) / hx).astype(int)
    iy = np.rint((y_phys - y0) / hy).astype(int)

    if (ix < 0).any() or (ix >= N).any() or (iy < 0).any() or (iy >= N).any():
        raise ValueError("Some CSV points lie outside the reconstructed grid.")

    Qgrid = np.empty((N, N), dtype=float)
    Qgrid[iy, ix] = q_vals  # row=y, col=x

    return x1d, y1d, Qgrid, hx, hy, x0, y0


# -----------------------------
# Helpers: physical <-> index
# -----------------------------
def phys_to_index(x_phys, y_phys, x0, y0, hx, hy):
    return (x_phys - x0) / hx, (y_phys - y0) / hy



# -----------------------------
# Bicubic interpolation of Q itself (for surface drawing + constraint)
# -----------------------------
def make_f_phys(Qgrid, x1d, y1d):
    spline = RectBivariateSpline(y1d, x1d, Qgrid, kx=3, ky=3)
    def f_phys(x, y):
        # RectBivariateSpline returns a 1x1 array for scalars
        return spline(y, x, grid=False)
    return f_phys, spline


# -----------------------------
# 5-point (4th-order) central-diff gradient at nodes + bilinear interpolation
# -----------------------------
def make_grad_f_phys(spline):
    def grad_f_phys(x, y):
        dQdx = spline(y, x, dx=0, dy=1, grid=False)  # ∂/∂x
        dQdy = spline(y, x, dx=1, dy=0, grid=False)  # ∂/∂y
        return float(dQdx), float(dQdy)
    return grad_f_phys

# ============================================================
# Load field + build f and grad_f in *physical coordinates*
# ============================================================
csv_path = "./data/Q.csv"  # <-- set this
N = 1000  # <-- must match MATLAB N used for export

nb = 3  # must match MATLAB

x1d, y1d, Qgrid, hx, hy, x0, y0 = load_q_field_csv(csv_path, N=N)

# Crop away the NaN vignette
x1d_c = x1d[nb:-nb]
y1d_c = y1d[nb:-nb]
Qgrid_c = Qgrid[nb:-nb, nb:-nb]

f, spline = make_f_phys(Qgrid_c, x1d_c, y1d_c)
grad_f = make_grad_f_phys(spline)


# -----------------------------
# Simulation parameters
# -----------------------------
#g = 9.81
dt = 0.001

# View parameters (camera window)
view_half_width = 4.5
grid_res = 1000
z_pad = .01

# Ball state (in PHYSICAL coordinates!)
# p = np.array([0.0, 0.0, float(f(0.0, 0.0))], dtype=float)
p = np.array([0.0, 0.0, 0.1], dtype=float)
v = np.array([1.5, 5.0, 0.0], dtype=float)  # v[2] unused


# -----------------------------
# Plot setup
# -----------------------------
fig = plt.figure()
ax = fig.add_subplot(111, projection="3d")
surface_artist = None
(ball_plot,) = ax.plot([p[0]], [p[1]], [p[2]], "ro", markersize=4)
ax.view_init(elev=30, azim=-60)


def draw_surface_centered(cx, cy):
    """Draw surface patch centered at (cx, cy). Returns (artist, zmin, zmax)."""
    xs = np.linspace(cx - view_half_width, cx + view_half_width, grid_res)
    ys = np.linspace(cy - view_half_width, cy + view_half_width, grid_res)
    X, Y = np.meshgrid(xs, ys)
    Z = f(X, Y)  # vectorized bilinear interpolation

    art = ax.plot_surface(X, Y, Z, alpha=1.0, cmap="inferno", linewidth=0, antialiased=True)
    return art, float(np.min(Z)), float(np.max(Z))


def step():
    global p, v
    x, y = float(p[0]), float(p[1])

    # Force from potential Q (choose sign!)
    fx, fy = grad_f(x, y)
    a_xy = -np.array([fx, fy], dtype=float)   # a = s-∇Q

    # Integrate (semi-implicit Euler)
    v[:2] += a_xy * dt
    p[:2] += v[:2] * dt

    # Keep z only for visualization
    p[2] = float(f(p[0], p[1]))
    p[2] = 0.1


def update(frame):
    global surface_artist

    step()

    # Update ball marker
    ball_plot.set_data([p[0]], [p[1]])
    ball_plot.set_3d_properties([p[2]])

    # Recenter view window around ball
    cx, cy = float(p[0]), float(p[1])
    ax.set_xlim(cx - view_half_width, cx + view_half_width)
    ax.set_ylim(cy - view_half_width, cy + view_half_width)

    # Replace surface patch
    if surface_artist is not None:
        surface_artist.remove()

    surface_artist, zmin, zmax = draw_surface_centered(cx, cy)
    ax.set_zlim(zmin - 0.1*(zmax-zmin), zmax + 0.1*(zmax-zmin))
    #ax.set_zlim(zmin - z_pad, zmax + z_pad)

    return (ball_plot, surface_artist)


# Initial surface
surface_artist, zmin0, zmax0 = draw_surface_centered(float(p[0]), float(p[1]))
ax.set_zlim(zmin0 - z_pad, zmax0 + z_pad)
ax.set_xlim(float(p[0]) - view_half_width, float(p[0]) + view_half_width)
ax.set_ylim(float(p[1]) - view_half_width, float(p[1]) + view_half_width)

ani = FuncAnimation(fig, update, frames=2000, interval=int(dt * 1000), blit=False)
plt.show()