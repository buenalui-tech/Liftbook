"""Second step: turn figure.blend (from build_figure.py) into figure.glb and render front/back test images.

    blender -b --python tools/anatomy/export_glb.py -- <out_dir> [preview]
"""
import sys
import os
import math
import bpy

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['/tmp']
OUT = args[0]
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(os.path.join(OUT, 'figure.blend')) as (src, dst):
    dst.objects = src.objects
scene = bpy.context.scene
for ob in bpy.data.objects:
    scene.collection.objects.link(ob)
    ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'figure.glb'), export_format='GLB', use_selection=True,
                          export_normals=True, export_materials='NONE', export_yup=True)
print('GLB', os.path.getsize(os.path.join(OUT, 'figure.glb')) // 1024, 'KB')

if 'preview' in args:
    # workbench test renders, colored like an Upper A day
    colors = {'main': (0.84, 0.23, 0.27, 1), 'also': (0.95, 0.63, 0.65, 1), 'off': (0.56, 0.59, 0.63, 1), 'body': (0.78, 0.8, 0.83, 1)}
    upper_a = {'chest': 'main', 'frontDelt': 'main', 'sideDelt': 'main', 'rearDelt': 'main', 'triceps': 'main', 'abs': 'main', 'traps': 'also', 'midBack': 'also'}
    for ob in bpy.data.objects:
        ob.color = colors['body'] if ob.name == 'body' else colors[upper_a.get(ob.name, 'off')]
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.color_type = 'OBJECT'
    scene.display.shading.light = 'STUDIO'
    scene.render.resolution_x, scene.render.resolution_y = 600, 1000
    scene.render.film_transparent = True
    cam_data = bpy.data.cameras.new('cam'); cam_data.lens = 70
    cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
    for label, ang in (('front', 0), ('back', math.pi)):
        # figure faces -Y in Blender; camera orbits around the vertical axis at mid height
        d = 58
        cam.location = (d * math.sin(ang), -d * math.cos(ang), 9.2)
        cam.rotation_euler = (math.radians(90), 0, ang)
        scene.render.filepath = os.path.join(OUT, f'preview_{label}.png')
        bpy.ops.render.render(write_still=True)
    print('PREVIEWS written')
