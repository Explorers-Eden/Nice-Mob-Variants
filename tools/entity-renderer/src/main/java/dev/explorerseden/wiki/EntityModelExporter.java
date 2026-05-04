package dev.explorerseden.wiki;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.CubeDeformation;

import java.io.FileWriter;
import java.lang.reflect.*;
import java.nio.file.Path;
import java.util.*;

public final class EntityModelExporter {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    public static void main(String[] args) throws Exception {
        Map<String, String> cli = parseArgs(args);
        String entity = req(cli, "entity");
        String model = cli.getOrDefault("model", "default");
        String age = cli.getOrDefault("age", "adult");
        Path output = Path.of(req(cli, "output"));

        LayerDefinition layer = createLayer(entity, model, age);
        ModelPart root = layer.bakeRoot();
        List<Map<String, Object>> quads = new ArrayList<>();
        exportPart(root, new Transform(), quads);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("entity", entity);
        out.put("model", model);
        out.put("age", age);
        out.put("source", "Mojang client ModelPart baked by Fabric Loom with official Mojang mappings");
        out.put("quadCount", quads.size());
        out.put("quads", quads);

        output.toFile().getParentFile().mkdirs();
        try (FileWriter fw = new FileWriter(output.toFile())) {
            GSON.toJson(out, fw);
        }
    }

    private static LayerDefinition createLayer(String entity, String model, String age) throws Exception {
        boolean baby = age.equalsIgnoreCase("baby");
        // Candidate class/method list is intentionally broad across 26.1 snapshots.
        String normalizedModel = model == null ? "default" : model.toLowerCase(Locale.ROOT).replace("minecraft:", "");
        List<String> classes = switch (entity) {
            case "cow" -> List.of("net.minecraft.client.model.CowModel", "net.minecraft.client.model.QuadrupedModel");
            case "pig" -> List.of("net.minecraft.client.model.PigModel", "net.minecraft.client.model.QuadrupedModel");
            case "chicken" -> List.of("net.minecraft.client.model.ChickenModel");
            case "wolf" -> List.of("net.minecraft.client.model.WolfModel");
            case "cat" -> List.of("net.minecraft.client.model.CatModel", "net.minecraft.client.model.OcelotModel");
            case "frog" -> List.of("net.minecraft.client.model.FrogModel");
            case "zombie_nautilus" -> List.of(
                    "net.minecraft.client.model.ZombieNautilusModel",
                    "net.minecraft.client.model.NautilusModel",
                    "net.minecraft.client.model.DrownedNautilusModel"
            );
            default -> throw new IllegalArgumentException("Unsupported entity type: " + entity);
        };
        List<String> methods = new ArrayList<>();
        if (baby) {
            methods.addAll(List.of("createBabyBodyLayer", "createBabyLayer", "createBodyLayer"));
        } else {
            methods.addAll(List.of("createBodyLayer", "createLayer", "createBodyModel"));
        }
        // Variant model names such as cold/warm usually still use the same class but can have own static layer methods.
        if (!normalizedModel.equals("default") && !normalizedModel.isBlank()) {
            String camel = Arrays.stream(normalizedModel.split("[_-]")).filter(s -> !s.isBlank()).map(s -> s.substring(0,1).toUpperCase(Locale.ROOT)+s.substring(1)).reduce("", String::concat);
            methods.add(0, "create" + camel + (baby ? "Baby" : "") + "BodyLayer");
            methods.add(0, "create" + camel + "BodyLayer");
        }
        Throwable last = null;
        for (String cn : classes) {
            Class<?> c;
            try { c = Class.forName(cn); } catch (Throwable t) { last = t; continue; }
            for (String mn : methods) {
                for (Method m : c.getDeclaredMethods()) {
                    if (!m.getName().equals(mn) || !Modifier.isStatic(m.getModifiers())) continue;
                    try {
                        m.setAccessible(true);
                        Object value = invokeLayerFactory(m, baby);
                        if (value instanceof LayerDefinition ld) return ld;
                    } catch (Throwable t) { last = t; }
                }
            }
        }
        throw new IllegalStateException("Could not bake Mojang model layer for entity=" + entity + " model=" + model + " age=" + age + "; last error=" + last);
    }

    private static Object invokeLayerFactory(Method m, boolean baby) throws Exception {
        Class<?>[] pts = m.getParameterTypes();
        Object[] args = new Object[pts.length];
        for (int i = 0; i < pts.length; i++) {
            Class<?> p = pts[i];
            if (p == boolean.class || p == Boolean.class) args[i] = baby;
            else if (p == float.class || p == Float.class) args[i] = 0.0f;
            else if (p == int.class || p == Integer.class) args[i] = 0;
            else if (p.getName().equals(CubeDeformation.class.getName())) args[i] = CubeDeformation.NONE;
            else args[i] = null;
        }
        return m.invoke(null, args);
    }

    private static void exportPart(ModelPart part, Transform parent, List<Map<String, Object>> quads) throws Exception {
        Transform t = parent.then(part.x, part.y, part.z, part.xRot, part.yRot, part.zRot);
        List<?> cubes = (List<?>) readFieldByType(part, List.class, "cubes");
        if (cubes != null) for (Object cube : cubes) exportCube(cube, t, quads);
        Map<?,?> children = (Map<?,?>) readFieldByType(part, Map.class, "children");
        if (children != null) for (Object child : children.values()) if (child instanceof ModelPart mp) exportPart(mp, t, quads);
    }

    private static void exportCube(Object cube, Transform t, List<Map<String, Object>> quads) throws Exception {
        Object polygonsObj = readFieldArrayOrList(cube, "polygons");
        if (polygonsObj == null) return;
        Iterable<?> polygons = iterable(polygonsObj);
        for (Object poly : polygons) {
            Object verticesObj = readFieldArrayOrList(poly, "vertices");
            if (verticesObj == null) continue;
            List<Map<String, Float>> verts = new ArrayList<>();
            for (Object vtx : iterable(verticesObj)) {
                Object pos = readAnyField(vtx, "pos", "position", "vertex");
                float x = readFloat(pos, "x");
                float y = readFloat(pos, "y");
                float z = readFloat(pos, "z");
                float u = readFloat(vtx, "u");
                float v = readFloat(vtx, "v");
                Vec3 vv = t.apply(new Vec3(x, y, z));
                Map<String, Float> out = new LinkedHashMap<>();
                // Flip Y to image-space friendly coordinates; node renderer handles camera afterwards.
                out.put("x", vv.x); out.put("y", -vv.y); out.put("z", vv.z); out.put("u", u); out.put("v", v);
                verts.add(out);
            }
            if (verts.size() == 4) quads.add(Map.of("vertices", verts));
        }
    }

    private static Object readFieldByType(Object obj, Class<?> type, String preferred) throws Exception {
        for (Field f : allFields(obj.getClass())) {
            if (f.getName().equals(preferred) || type.isAssignableFrom(f.getType())) {
                f.setAccessible(true);
                Object val = f.get(obj);
                if (val != null && type.isAssignableFrom(val.getClass())) return val;
            }
        }
        return null;
    }
    private static Object readFieldArrayOrList(Object obj, String preferred) throws Exception {
        for (Field f : allFields(obj.getClass())) {
            if (f.getName().equals(preferred) || f.getType().isArray() || List.class.isAssignableFrom(f.getType())) {
                f.setAccessible(true); Object val = f.get(obj);
                if (val != null && (val.getClass().isArray() || val instanceof List<?>)) return val;
            }
        }
        return null;
    }
    private static Object readAnyField(Object obj, String... names) throws Exception {
        if (obj == null) return null;
        Set<String> want = new HashSet<>(Arrays.asList(names));
        for (Field f : allFields(obj.getClass())) {
            if (want.contains(f.getName()) || f.getType().getName().endsWith("Vector3f") || f.getType().getName().endsWith("Vec3")) {
                f.setAccessible(true); Object val = f.get(obj); if (val != null) return val;
            }
        }
        return null;
    }
    private static float readFloat(Object obj, String name) throws Exception {
        if (obj == null) return 0f;
        for (Field f : allFields(obj.getClass())) {
            if (f.getName().equals(name) || (name.equals("x") && f.getName().equals("xCoord")) || (name.equals("y") && f.getName().equals("yCoord")) || (name.equals("z") && f.getName().equals("zCoord"))) {
                f.setAccessible(true); return ((Number) f.get(obj)).floatValue();
            }
        }
        try {
            Method m = obj.getClass().getMethod(name); return ((Number) m.invoke(obj)).floatValue();
        } catch (NoSuchMethodException ignored) {}
        return 0f;
    }
    private static List<Field> allFields(Class<?> c) { List<Field> fs = new ArrayList<>(); while(c!=null){ fs.addAll(Arrays.asList(c.getDeclaredFields())); c=c.getSuperclass(); } return fs; }
    private static Iterable<?> iterable(Object o) { if (o instanceof Iterable<?> it) return it; int n = Array.getLength(o); List<Object> l=new ArrayList<>(n); for(int i=0;i<n;i++) l.add(Array.get(o,i)); return l; }

    private static Map<String,String> parseArgs(String[] args) { Map<String,String> m=new HashMap<>(); for(int i=0;i<args.length;i++){ if(args[i].startsWith("--")){ String k=args[i].substring(2); String v=(i+1<args.length && !args[i+1].startsWith("--"))?args[++i]:"true"; m.put(k,v);} } return m; }
    private static String req(Map<String,String> m, String k) { String v=m.get(k); if(v==null||v.isBlank()) throw new IllegalArgumentException("Missing --"+k); return v; }

    record Vec3(float x, float y, float z) {}
    static final class Transform {
        final float x,y,z,xr,yr,zr; final Transform parent;
        Transform(){this(null,0,0,0,0,0,0);} Transform(Transform p,float x,float y,float z,float xr,float yr,float zr){this.parent=p;this.x=x;this.y=y;this.z=z;this.xr=xr;this.yr=yr;this.zr=zr;}
        Transform then(float x,float y,float z,float xr,float yr,float zr){return new Transform(this,x,y,z,xr,yr,zr);}        
        Vec3 apply(Vec3 v){ Vec3 r=applyLocal(v); return parent==null ? r : parent.apply(r); }
        Vec3 applyLocal(Vec3 v){ float xx=v.x, yy=v.y, zz=v.z; float cx=(float)Math.cos(xr), sx=(float)Math.sin(xr); float cy=(float)Math.cos(yr), sy=(float)Math.sin(yr); float cz=(float)Math.cos(zr), sz=(float)Math.sin(zr); float y1=yy*cx-zz*sx, z1=yy*sx+zz*cx; yy=y1; zz=z1; float x2=xx*cy+zz*sy, z2=-xx*sy+zz*cy; xx=x2; zz=z2; float x3=xx*cz-yy*sz, y3=xx*sz+yy*cz; return new Vec3(x3+x, y3+y, zz+z); }
    }
}
