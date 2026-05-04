package dev.explorerseden.wiki;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.CubeDeformation;

import java.io.File;
import java.io.FileWriter;
import java.lang.reflect.*;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

/**
 * Exports baked Minecraft client entity ModelPart geometry as simple JSON.
 *
 * This intentionally does not hardcode old class names such as OcelotModel.
 * Minecraft's client model packages and class names have moved repeatedly from
 * 1.20 through 26.x, so the exporter discovers candidate model classes at
 * runtime from the Loom runtime classpath and invokes their static LayerDefinition
 * factory methods reflectively.
 */
public final class EntityModelExporter {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private static final Map<String, List<String>> MODEL_SIMPLE_NAMES = Map.of(
            "cat", List.of("CatModel", "FelineModel", "OcelotModel"),
            "wolf", List.of("WolfModel"),
            "chicken", List.of("ChickenModel"),
            "frog", List.of("FrogModel"),
            "pig", List.of("PigModel", "AbstractPigModel", "QuadrupedModel"),
            "cow", List.of("CowModel", "AbstractCowModel", "QuadrupedModel"),
            "zombie_nautilus", List.of("ZombieNautilusModel", "NautilusModel", "DrownedNautilusModel")
    );

    public static void main(String[] args) throws Exception {
        Map<String, String> cli = parseArgs(args);
        String entity = req(cli, "entity").toLowerCase(Locale.ROOT);
        String model = cli.getOrDefault("model", "default");
        String age = cli.getOrDefault("age", "adult").toLowerCase(Locale.ROOT);
        Path output = Path.of(req(cli, "output"));

        LayerDefinition layer = createLayer(entity, model, age);
        ModelPart root = layer.bakeRoot();
        List<Map<String, Object>> quads = new ArrayList<>();
        exportPart(root, new Transform(), quads);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("entity", entity);
        out.put("model", model);
        out.put("age", age);
        out.put("source", "Mojang client ModelPart baked by Fabric Loom runtime; model class discovered dynamically");
        out.put("quadCount", quads.size());
        out.put("quads", quads);

        output.toFile().getParentFile().mkdirs();
        try (FileWriter fw = new FileWriter(output.toFile())) {
            GSON.toJson(out, fw);
        }
        System.out.println("Exported " + quads.size() + " quads to " + output);
    }

    private static LayerDefinition createLayer(String entity, String model, String age) throws Exception {
        boolean baby = age.equalsIgnoreCase("baby");
        String normalizedModel = normalizeModel(model);

        List<String> candidateClasses = candidateModelClasses(entity);
        if (candidateClasses.isEmpty()) {
            throw new IllegalStateException("No runtime model class candidates found for entity=" + entity + ". Classpath=" + System.getProperty("java.class.path"));
        }

        List<String> methodNames = candidateFactoryMethods(normalizedModel, baby);
        Throwable last = null;
        List<String> attempted = new ArrayList<>();

        for (String className : candidateClasses) {
            Class<?> clazz;
            try {
                clazz = Class.forName(className);
            } catch (Throwable t) {
                last = t;
                attempted.add(className + " <class load failed: " + t.getClass().getSimpleName() + ">");
                continue;
            }

            for (String methodName : methodNames) {
                for (Method method : clazz.getDeclaredMethods()) {
                    if (!method.getName().equals(methodName) || !Modifier.isStatic(method.getModifiers())) continue;
                    if (!LayerDefinition.class.isAssignableFrom(method.getReturnType())) continue;
                    String label = clazz.getName() + "#" + method.getName() + descriptor(method);
                    attempted.add(label);
                    try {
                        method.setAccessible(true);
                        Object value = invokeLayerFactory(method, baby);
                        if (value instanceof LayerDefinition layerDefinition) {
                            System.out.println("Using Mojang model layer factory " + label);
                            return layerDefinition;
                        }
                    } catch (Throwable t) {
                        last = unwrap(t);
                    }
                }
            }

            // Final fallback: try any static method returning LayerDefinition.
            for (Method method : clazz.getDeclaredMethods()) {
                if (!Modifier.isStatic(method.getModifiers())) continue;
                if (!LayerDefinition.class.isAssignableFrom(method.getReturnType())) continue;
                String label = clazz.getName() + "#" + method.getName() + descriptor(method);
                if (attempted.contains(label)) continue;
                attempted.add(label);
                try {
                    method.setAccessible(true);
                    Object value = invokeLayerFactory(method, baby);
                    if (value instanceof LayerDefinition layerDefinition) {
                        System.out.println("Using fallback Mojang model layer factory " + label);
                        return layerDefinition;
                    }
                } catch (Throwable t) {
                    last = unwrap(t);
                }
            }
        }

        throw new IllegalStateException("Could not bake Mojang model layer for entity=" + entity + " model=" + model + " age=" + age
                + "; candidates=" + candidateClasses
                + "; attempted=" + attempted
                + "; last error=" + last);
    }

    private static String normalizeModel(String model) {
        String value = model == null ? "default" : model.toLowerCase(Locale.ROOT).replace("minecraft:", "");
        int slash = value.lastIndexOf('/');
        if (slash >= 0) value = value.substring(slash + 1);
        return value.isBlank() ? "default" : value;
    }

    private static List<String> candidateFactoryMethods(String normalizedModel, boolean baby) {
        LinkedHashSet<String> methods = new LinkedHashSet<>();
        if (!normalizedModel.equals("default")) {
            String camel = toCamel(normalizedModel);
            if (baby) {
                methods.add("create" + camel + "BabyBodyLayer");
                methods.add("createBaby" + camel + "BodyLayer");
            }
            methods.add("create" + camel + "BodyLayer");
            methods.add("create" + camel + "Layer");
            methods.add("create" + camel + "Model");
        }
        if (baby) {
            methods.add("createBabyBodyLayer");
            methods.add("createBabyLayer");
            methods.add("createBodyLayer");
            methods.add("createLayer");
            methods.add("createBodyModel");
        } else {
            methods.add("createBodyLayer");
            methods.add("createLayer");
            methods.add("createBodyModel");
            methods.add("createAdultBodyLayer");
        }
        return new ArrayList<>(methods);
    }

    private static String toCamel(String value) {
        StringBuilder out = new StringBuilder();
        for (String part : value.split("[_-]+")) {
            if (part.isBlank()) continue;
            out.append(part.substring(0, 1).toUpperCase(Locale.ROOT)).append(part.substring(1));
        }
        return out.toString();
    }

    private static Throwable unwrap(Throwable t) {
        if (t instanceof InvocationTargetException ite && ite.getTargetException() != null) return ite.getTargetException();
        return t;
    }

    private static String descriptor(Method m) {
        StringBuilder sb = new StringBuilder("(");
        Class<?>[] types = m.getParameterTypes();
        for (int i = 0; i < types.length; i++) {
            if (i > 0) sb.append(",");
            sb.append(types[i].getSimpleName());
        }
        return sb.append(")").toString();
    }

    private static List<String> candidateModelClasses(String entity) throws Exception {
        List<String> simpleNames = MODEL_SIMPLE_NAMES.get(entity);
        if (simpleNames == null) throw new IllegalArgumentException("Unsupported entity type: " + entity);

        LinkedHashSet<String> out = new LinkedHashSet<>();

        // Common package guesses across 1.20 -> 26.x. These are only hints;
        // classpath scanning below is the authoritative fallback.
        for (String simple : simpleNames) {
            out.add("net.minecraft.client.model." + simple);
            out.add("net.minecraft.client.model.entity." + simple);
            out.add("net.minecraft.client.renderer.entity.model." + simple);
        }

        Map<String, List<String>> scanned = scanRuntimeClasspathForModelClasses(new HashSet<>(simpleNames));
        for (String simple : simpleNames) {
            for (String className : scanned.getOrDefault(simple, List.of())) out.add(className);
        }

        // Keep only loadable classes, but preserve failed guessed names in the later diagnostics if none load.
        List<String> loadable = new ArrayList<>();
        for (String className : out) {
            try {
                Class.forName(className, false, EntityModelExporter.class.getClassLoader());
                loadable.add(className);
            } catch (Throwable ignored) {
            }
        }
        return loadable.isEmpty() ? new ArrayList<>(out) : loadable;
    }

    private static Map<String, List<String>> scanRuntimeClasspathForModelClasses(Set<String> targetSimpleNames) throws Exception {
        Map<String, List<String>> found = new HashMap<>();
        String classPath = System.getProperty("java.class.path", "");
        String sep = System.getProperty("path.separator");
        for (String entry : classPath.split(java.util.regex.Pattern.quote(sep))) {
            if (entry == null || entry.isBlank()) continue;
            String decoded = URLDecoder.decode(entry, StandardCharsets.UTF_8);
            Path p = Path.of(decoded);
            if (Files.isRegularFile(p) && decoded.endsWith(".jar")) scanJar(p, targetSimpleNames, found);
            else if (Files.isDirectory(p)) scanDirectory(p, targetSimpleNames, found);
        }
        for (List<String> list : found.values()) Collections.sort(list);
        return found;
    }

    private static void scanJar(Path jar, Set<String> targetSimpleNames, Map<String, List<String>> found) {
        try (JarFile jf = new JarFile(jar.toFile())) {
            Enumeration<JarEntry> entries = jf.entries();
            while (entries.hasMoreElements()) {
                JarEntry e = entries.nextElement();
                if (!e.getName().endsWith(".class")) continue;
                String className = e.getName().replace('/', '.').replaceAll("\\.class$", "");
                String simple = className.substring(className.lastIndexOf('.') + 1);
                if (targetSimpleNames.contains(simple)) found.computeIfAbsent(simple, k -> new ArrayList<>()).add(className);
            }
        } catch (Throwable ignored) {
        }
    }

    private static void scanDirectory(Path dir, Set<String> targetSimpleNames, Map<String, List<String>> found) {
        try {
            Files.walk(dir).filter(Files::isRegularFile).filter(p -> p.toString().endsWith(".class")).forEach(p -> {
                String rel = dir.relativize(p).toString().replace(File.separatorChar, '.').replaceAll("\\.class$", "");
                String simple = rel.substring(rel.lastIndexOf('.') + 1);
                if (targetSimpleNames.contains(simple)) found.computeIfAbsent(simple, k -> new ArrayList<>()).add(rel);
            });
        } catch (Throwable ignored) {
        }
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
        try { Method m = obj.getClass().getMethod(name); return ((Number) m.invoke(obj)).floatValue(); } catch (NoSuchMethodException ignored) {}
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
