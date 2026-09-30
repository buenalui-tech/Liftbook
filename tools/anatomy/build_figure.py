"""Builds Liftbook's muscle-map figure from the Z-Anatomy atlas (CC BY-SA 4.0, derived from BodyParts3D).

Run headless:
    blender -b <path>/Z-Anatomy/Startup.blend --python tools/anatomy/build_figure.py -- <out_dir>

Writes <out_dir>/figure.blend (then run export_glb.py for figure.glb): one mesh per muscle group (named like MUSCLE_GROUPS in index.html)
plus a neutral 'body' mesh, decimated for phones. Also renders front/back test images.
"""
import sys
import os
import re
import bpy

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp'
os.makedirs(OUT, exist_ok=True)

GROUPS = {
    'chest': ['Clavicular head of pectoralis major muscle', 'Sternocostal head of pectoralis major muscle', '(Abdominal part of pectoralis major muscle)'],
    'frontDelt': ['Clavicular part of deltoid muscle'],
    'sideDelt': ['Acromial part of deltoid muscle'],
    'rearDelt': ['Scapular spinal part of deltoid muscle'],
    'traps': ['Descending part of trapezius muscle'],
    'midBack': ['Transverse part of trapezius muscle', 'Ascending part of trapezius muscle', 'Rhomboid major muscle', 'Rhomboid minor muscle', 'Infraspinatus muscle'],
    'lats': ['Latissimus dorsi muscle', 'Teres major muscle'],
    'lowBack': ['Iliocostalis lumborum muscle', 'Iliocostalis thoracis muscle', 'Longissimus thoracis muscle', 'Spinalis thoracis muscle'],
    'abs': ['Rectus abdominis muscle'],
    'obliques': ['External abdominal oblique muscle', 'Serratus anterior muscle'],
    'biceps': ['Long head of biceps brachii', 'Short head of biceps brachii', 'Brachialis muscle'],
    'triceps': ['Long head of triceps brachii', 'Lateral head of triceps brachii', 'Medial head of triceps brachii'],
    'forearms': ['Brachioradialis muscle', 'Extensor carpi radialis longus', 'Extensor carpi radialis brevis', 'Extensor digitorum',
                 'Humeral head of flexor carpi ulnaris', 'Ulnar head of flexor carpi ulnaris', 'Flexor carpi radialis', 'Palmaris longus muscle',
                 'Humeral head of extensor carpi ulnaris', 'Ulnar head of extensor carpi ulnaris', 'Superficial head of pronator teres'],
    'glutes': ['Gluteus maximus muscle', 'Gluteus medius muscle'],
    'quads': ['Rectus femoris muscle', 'Vastus lateralis muscle', 'Vastus medialis muscle'],
    'hamstrings': ['Long head of biceps femoris', 'Short head of biceps femoris', 'Semitendinosus muscle', 'Semimembranosus muscle'],
    'calves': ['Medial head of gastrocnemius', 'Lateral head of gastrocnemius', 'Soleus muscle'],
}
# visible but never scored: rounds out the silhouette
NEUTRAL_MUSCLES = ['Sartorius muscle', 'Tensor fasciae latae', 'Gracilis muscle', 'Adductor longus', 'Adductor magnus', 'Tibialis anterior muscle',
                   'Fibularis longus muscle', 'Platysma',
                   'Sternocleidomastoid muscle', 'Splenius capitis muscle', 'Extensor digitorum longus', 'Teres minor muscle', 'Pectoralis minor muscle']
# the skull reads as creepy on a fitness app, so the head is a smooth shape sized to it (see smooth_head)
HEAD_COLLECTIONS = ['Cranium', 'Extracranial bones of head']
NEUTRAL_BONE_COLLECTIONS = ['Vertebral column', 'Thoracic skeleton', 'Bony pelvis',
                            'Bones of upper limb', 'Bones of lower limb']
TRI_BUDGET = {'body': 60000, 'head': 6000}   # neutral mesh budget; muscle groups get DEFAULT_TRIS each
DEFAULT_TRIS = 5000

objs = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}


def sides(base):
    return [objs[n] for n in (base + '.l', base + '.r', base) if n in objs]


def collection_meshes(name):
    for c in bpy.data.collections:
        if c.name == name:
            return [o for o in c.all_objects if o.type == 'MESH']
    print('missing collection', name)
    return []


def merged(name, sources):
    """Copy sources into one new mesh object with transforms applied."""
    import bmesh
    bm = bmesh.new()
    for o in sources:
        tmp = bmesh.new()
        tmp.from_mesh(o.data)
        tmp.transform(o.matrix_world)
        m = bpy.data.meshes.new('tmp')
        tmp.to_mesh(m)
        tmp.free()
        bm.from_mesh(m)
        bpy.data.meshes.remove(m)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new(name, mesh)
    return ob


def decimate(ob, tris):
    count = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if count > tris:
        mod = ob.modifiers.new('dec', 'DECIMATE')
        mod.ratio = tris / count
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in ob.data.polygons:
        p.use_smooth = True
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


# fresh scene holding only the figure
scene = bpy.data.scenes.new('Figure')
bpy.context.window.scene = scene if bpy.context.window else scene
coll = scene.collection
missing = []
built = []
for g, names in GROUPS.items():
    src = [o for n in names for o in sides(n)]
    missing += [n for n in names if not sides(n)]
    ob = merged(g, src)
    coll.objects.link(ob)
    built.append(ob)

# The external oblique's aponeurosis sheet covers the front of the rectus abdominis in this atlas,
# which hides the abs. Cut the oblique mesh away wherever it lies over the rectus.
def trim_over(cover, under, margin=0.004):
    import bmesh
    xs = [v.co.x for v in under.data.vertices]; zs = [v.co.z for v in under.data.vertices]; ys = [v.co.y for v in under.data.vertices]
    x0, x1, z0, z1, ymax = min(xs) - margin, max(xs) + margin, min(zs), max(zs), max(ys)
    bm = bmesh.new(); bm.from_mesh(cover.data)
    # the figure faces -Y: anything in front of the rectus's back surface and inside its outline goes
    doomed = [v for v in bm.verts if x0 < v.co.x < x1 and z0 < v.co.z < z1 and v.co.y < ymax]
    bmesh.ops.delete(bm, geom=doomed, context='VERTS')
    bm.to_mesh(cover.data); bm.free()
    print('trimmed', len(doomed), 'verts from', cover.name)


by_name = {o.name: o for o in built}
trim_over(by_name['obliques'], by_name['abs'])

neutral_src = [o for n in NEUTRAL_MUSCLES for o in sides(n)]
missing += [n for n in NEUTRAL_MUSCLES if not sides(n)]
for cn in NEUTRAL_BONE_COLLECTIONS:
    neutral_src += [o for o in collection_meshes(cn) if 'tooth' not in o.name.lower() and 'teeth' not in o.name.lower()]
body = merged('body', neutral_src)


def bounds(meshes):
    import mathutils
    lo = mathutils.Vector((1e9, 1e9, 1e9)); hi = -lo
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(c)
            lo = mathutils.Vector(map(min, lo, w)); hi = mathutils.Vector(map(max, hi, w))
    return lo, hi


def smooth_head():
    """A plain head: a cranium ellipsoid plus a jaw ellipsoid, each sized to the skull with a little soft tissue."""
    import bmesh, mathutils
    # size from the named vault/face bones only; the collections also hold labels and helpers that span the body
    SKULL = ('frontal bone', 'parietal bone', 'occipital bone', 'temporal bone', 'zygomatic bone', 'maxilla', 'nasal bone', 'mandible')
    skull = [o for cn in HEAD_COLLECTIONS for o in collection_meshes(cn) if re.sub(r'\.[lr]$', '', o.name.lower()) in SKULL]
    print('head sized from', sorted({o.name for o in skull}))
    jaw = [o for o in skull if 'mandible' in o.name.lower()]
    lo, hi = bounds(skull)
    jlo, jhi = bounds(jaw) if jaw else (lo, hi)
    bm = bmesh.new()
    def ellipsoid(center, radii):
        m = bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=1.0)
        for v in m['verts']:
            v.co = mathutils.Vector((v.co.x * radii.x + center.x, v.co.y * radii.y + center.y, v.co.z * radii.z + center.z))
    size = hi - lo
    cranium_c = (lo + hi) / 2 + mathutils.Vector((0, 0, size.z * 0.08))
    ellipsoid(cranium_c, mathutils.Vector((size.x * 0.54, size.y * 0.53, size.z * 0.44)))
    jsize = jhi - jlo
    jaw_c = (jlo + jhi) / 2 + mathutils.Vector((0, -jsize.y * 0.05, jsize.z * 0.1))
    ellipsoid(jaw_c, mathutils.Vector((jsize.x * 0.48, jsize.y * 0.5, jsize.z * 0.62)))
    mesh = bpy.data.meshes.new('head'); bm.to_mesh(mesh); bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    return bpy.data.objects.new('head', mesh)


head = smooth_head()
coll.objects.link(head)
built.append(head)
coll.objects.link(body)
built.append(body)

bpy.context.window_manager  # noqa
for ob in built:
    ob.select_set(False)
view_layer = scene.view_layers[0]
for ob in built:
    view_layer.objects.active = ob
    with bpy.context.temp_override(scene=scene, view_layer=view_layer, active_object=ob, object=ob, selected_objects=[ob]):
        t = decimate(ob, TRI_BUDGET.get(ob.name, DEFAULT_TRIS))
    print(f'{ob.name:12s} {t:7d} tris')

# center on the floor, facing +Y (glTF exporter converts Blender Z-up to Y-up)
import mathutils
mins = mathutils.Vector((1e9, 1e9, 1e9)); maxs = -mins
for ob in built:
    for v in ob.data.vertices:
        mins = mathutils.Vector(map(min, mins, v.co)); maxs = mathutils.Vector(map(max, maxs, v.co))
center = (mins + maxs) / 2
height = maxs.z - mins.z
scale = 18.0 / height   # same units as the mannequin: 18 tall
for ob in built:
    ob.data.transform(mathutils.Matrix.Translation((-center.x, -center.y, -mins.z)))
    ob.data.transform(mathutils.Matrix.Scale(scale, 4))
print('model height', round(height, 3), 'scaled to 18; bounds', [round(x, 2) for x in (maxs - mins)])
if missing:
    print('MISSING', missing)

# save only the figure into a small .blend; export_glb.py exports it (the full atlas scene crashes the exporter)
bpy.data.libraries.write(os.path.join(OUT, 'figure.blend'), set(built), fake_user=True)
print('BLEND', os.path.getsize(os.path.join(OUT, 'figure.blend')) // 1024, 'KB')
