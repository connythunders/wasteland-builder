"""Build a 3D model of a generated world in Blender and export it as .glb.

    blender --background --python tools/blender_build.py -- worlds/rattvik/world.json out/rattvik.glb

Optional: the game itself builds the world straight from world.json and does not need Blender.
Use this to polish the city in Blender, render stills, or move it to another engine.
(Written against Blender 4.x; geometry only, flat-coloured materials.)
"""
import bpy, bmesh, json, sys
from pathlib import Path

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
src = Path(argv[0] if argv else "worlds/rattvik/world.json")
dst = Path(argv[1] if len(argv) > 1 else src.with_suffix(".glb"))
w = json.loads(src.read_text(encoding="utf-8"))

bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
coll = bpy.context.scene.collection


def mat(name, rgb):
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*rgb, 1)
    m.diffuse_color = (*rgb, 1)
    return m


M = {k: mat(k, c) for k, c in dict(
    ground=(.45, .30, .16), building=(.45, .32, .20), road=(.04, .035, .03), water=(.09, .12, .03),
    forest=(.06, .05, .02), field=(.38, .30, .14), rail=(.02, .02, .02)).items()}


def obj_from(name, bm, material):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me); coll.objects.link(o); return o


def to3(p, y=0.0):  # game frame (x east, z south) -> Blender (x east, y north, z up)
    return (p[0], -p[1], y)


def poly_mesh(name, items, material, y, depth=0.0):
    bm = bmesh.new()
    for it in items:
        try:
            vs = [bm.verts.new(to3(p, y)) for p in it["p"]]
            f = bm.faces.new(vs)
            if depth:
                r = bmesh.ops.extrude_face_region(bm, geom=[f])
                bmesh.ops.translate(bm, vec=(0, 0, depth(it)), verts=[v for v in r["geom"] if isinstance(v, bmesh.types.BMVert)])
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from(name, bm, material)


def ribbon_mesh(name, lines, material, y):
    bm = bmesh.new()
    for l in lines:
        hw = l["w"] / 2
        for a, b in zip(l["p"], l["p"][1:]):
            dx, dz = b[0] - a[0], b[1] - a[1]; ln = (dx * dx + dz * dz) ** .5
            if ln < .01: continue
            nx, nz = -dz / ln * hw, dx / ln * hw
            q = [bm.verts.new(to3((a[0] + nx, a[1] + nz), y)), bm.verts.new(to3((a[0] - nx, a[1] - nz), y)),
                 bm.verts.new(to3((b[0] - nx, b[1] - nz), y)), bm.verts.new(to3((b[0] + nx, b[1] + nz), y))]
            try: bm.faces.new(q)
            except ValueError: pass
    return obj_from(name, bm, material)


# ground
e = w["extent"] * 1.5
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=e)
obj_from("Ground", bm, M["ground"])
poly_mesh("Forest", [g for g in w["green"] if g["k"] in ("forest", "scrub")], M["forest"], 0.02)
poly_mesh("Fields", [g for g in w["green"] if g["k"] not in ("forest", "scrub")], M["field"], 0.02)
poly_mesh("Water", w["water"], M["water"], 0.04)
ribbon_mesh("Rivers", w["rivers"], M["water"], 0.045)
ribbon_mesh("Roads", w["roads"], M["road"], 0.06)
ribbon_mesh("Rails", w["rails"], M["rail"], 0.07)
poly_mesh("Buildings", w["buildings"], M["building"], 0.0, depth=lambda b: b["h"])

dst.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(dst), export_format="GLB")
print("Exported", dst)
