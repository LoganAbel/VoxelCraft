// Full Screen rendering shaders
// Should be loaded from non JS file for easier editting and debugging

const vertex_shader = 
`#version 300 es

in vec4 a_pos;
out vec2 v_pos;
 
void main() {
   gl_Position = a_pos;
   v_pos = a_pos.xy;
}
`

const fragment_shader = `#version 300 es

precision mediump float;
precision mediump usampler2D;

in vec2 v_pos;
out vec4 fragColor;

uniform mat4 u_cam;
uniform float u_dim;

uniform usampler2D u_data;
#define u_data_dim uvec2(1024, 1024)

uniform sampler2D u_tex;
#define u_tex_dim vec2(8, 8)

#define flip_color() fragColor = vec4(vec3(1) - fragColor.xyz, 1.)

#define MAX_DEPTH 6
#define CUBE_SIZE 8
#define MAX_ITER 200

struct Ray {
   vec3 pos;
   vec3 dir;
};

uint get_node (uint i) {
   return texelFetch(u_data, ivec2(i % u_data_dim.x, i / u_data_dim.x), 0).r;
}

vec4 overlay(vec4 over, vec4 under) {
   under.a *= (1. - over.a);
   float newa = over.a + under.a;
   if (newa == 0.) return vec4(0);
   return vec4((over.rgb * over.a + under.rgb * under.a) / newa, newa);
}

uint get_child(inout vec3 tmin, inout vec3 tmax, inout ivec3 pos, uint children) {
   vec3 tmid = mix(tmin, tmax, .5);
   float t = max(max(max(tmin.x, tmin.y), tmin.z), 0.);
   vec3 dir = vec3(greaterThan(vec3(t), tmid));

   pos = (pos << 1) | ivec3(dir);
   tmin = mix(tmin, tmid, dir);
   tmax = mix(tmid, tmax, dir);

   return children * 8u + uint(dot(dir, vec3(1,2,4)));
}

uint stack[MAX_DEPTH];

bool trace_octree_rough (Ray ray) {
   vec3 dir = vec3(lessThan(ray.dir, vec3(0.)));
   uint oct_mask = uint(dot(dir, vec3(1,2,4)));
   vec3 tmin = - mix(ray.pos, dir-ray.pos, dir) / abs(ray.dir);
   vec3 tmax = tmin + 1. / abs(ray.dir);

   ivec3 pos = ivec3(0);
   uint idx = get_child(tmin, tmax, pos, 0u);

   int stacklen = 0;

   uint data;

   int i = 0;
   for(; i < MAX_ITER; i ++) {
      data = get_node(idx ^ oct_mask);
      if ((data & 1u) == 1u) {
         data >>= 1u;

         if (data != 0u && data != 1u && data != 4u) return true;

         float tc_max = min(min(tmax.x, tmax.y), tmax.z);
         vec3 hitdir = vec3(equal(tmax, vec3(tc_max)));
         int p = int(dot(vec3(pos), hitdir));

         if ((p & 1) == 1) {
            int i = 0;
            while ((p & 1) == 1) {
               p >>= 1;
               i ++;
            }
            vec3 _tmin = mix(tmin, tmax, -vec3(pos&((1<<i)-1)));
            tmax = mix(tmin, tmax, vec3((1<<i)-(pos&((1<<i)-1))));
            tmin = _tmin;
            pos >>= i;
            stacklen -= i;
            if (stacklen < 0) return false;
            idx = stack[stacklen];
         }

         pos += ivec3(hitdir);
         idx += uint(dot(hitdir, vec3(1,2,4)));

         vec3 _tmax = mix(tmin, tmax, vec3(1)+hitdir);
         tmin = mix(tmin, tmax, hitdir);
         tmax = _tmax;

      } else { // is branch: get child
         stack[stacklen++] = idx;
         idx = get_child(tmin, tmax, pos, data>>1u);
      }
   }

   return false;
}

vec4 color_block(uint i, inout uint medium, vec4 color, vec3 tmin, vec3 tmax, 
                  ivec3 pos, int stacklen, Ray ray, vec3 dir, float tMIN, float tMAX) {
   if (i == 0u) {
      medium = 0u;
      return color;
   }
   if (i == 4u) {
      tMAX = min(tMAX, mix(tmax.y, tmin.y, (1.-dir.y)/8.));
      tMIN = max(tMIN, mix(tmin.y, tmax.y, dir.y/8.));
      if (tMIN > tMAX) return color;
      i = 1u;
   }
   if (i == 1u) {
      if (medium != 1u) color = overlay(color, vec4(65, 177, 246, 150)/255.);
      medium = 1u;
      return overlay(color, vec4(vec3(59, 93, 201)/255.,
         1. - pow(.5, float(1 << CUBE_SIZE) * .2 * (tMAX - tMIN)))
      );
   }

   float t = tMIN;
   vec3 norm = vec3(equal(tmin, vec3(t)));

   vec3 hitp = ray.pos + ray.dir * t;

   vec3 hitp_uv = mod(-hitp * float(1 << CUBE_SIZE), 1.);
   vec2 uv = vec2(norm.x == 1. ? hitp_uv.z : hitp_uv.x, norm.y == 1. ? hitp_uv.z : hitp_uv.y);
   norm *= 2. * dir - 1.;

   vec2 texp = vec2(0,1);
   if (i == 2u) texp = norm.y == 0. ? vec2(0,0) : norm.y == 1. ? vec2(2,0) : vec2(1,0);
   if (i == 3u) texp = vec2(1,0);
   if (i == 5u) texp = vec2(3,0);

   vec4 new_color = texture(u_tex, (texp + uv) / u_tex_dim);

   if(dot(vec3(1,3,2), norm) > 0.) {
      Ray newray = Ray(hitp + norm * pow(.5, float(CUBE_SIZE + 6)), normalize(vec3(1,3,2)));
      if(trace_octree_rough(newray)) new_color.rgb *= .5;
   } else {
      new_color.rgb *= .75;
   }

   color = overlay(color, new_color);

   return color;
}

vec4 trace_octree (Ray ray, vec4 bg) {
   vec3 dir = vec3(lessThan(ray.dir, vec3(0.)));
   uint oct_mask = uint(dot(dir, vec3(1,2,4)));
   vec3 tmin = - mix(ray.pos, dir-ray.pos, dir) / abs(ray.dir);
   vec3 tmax = tmin + 1. / abs(ray.dir);

   if (min(min(tmax.x, tmax.y), tmax.z) < max(max(max(tmin.x, tmin.y), tmin.z), 0.)) return vec4(0);

   ivec3 pos = ivec3(0);
   uint idx = get_child(tmin, tmax, pos, 0u);

   int stacklen = 0;

   uint medium = 0u;

   uint data;
   vec4 color = vec4(0);

   int i = 0;
   for(; i < MAX_ITER; i ++) {
      data = get_node(idx ^ oct_mask);
      if ((data & 1u) == 1u) {
         data >>= 1u;
         float tc_max = min(min(tmax.x, tmax.y), tmax.z);
         float tc_min = max(max(max(tmin.x, tmin.y), tmin.z), 0.);
         color = color_block(data, medium, color, tmin, tmax, pos, stacklen, ray, dir, tc_min, tc_max);

         color = overlay(color, vec4(bg.rgb,
           1. - pow(.5, float(1 << CUBE_SIZE) * .2 * (max(tc_max, .35) - max(tc_min, .35))))
         );

         //bg.a = 10. * clamp(tc_min - .35, 0., .1);

         if (color.a > .99) break;

         vec3 hitdir = vec3(equal(tmax, vec3(tc_max)));
         int p = int(dot(vec3(pos), hitdir));

         if ((p & 1) == 1) {
            int i = 0;
            while ((p & 1) == 1) {
               p >>= 1;
               i ++;
            }
            vec3 _tmin = mix(tmin, tmax, -vec3(pos&((1<<i)-1)));
            tmax = mix(tmin, tmax, vec3((1<<i)-(pos&((1<<i)-1))));
            tmin = _tmin;
            pos >>= i;
            stacklen -= i;
            if (stacklen < 0) {
               tmin = vec3(1e10);
               break;
            }
            idx = stack[stacklen];
         }

         pos += ivec3(hitdir);
         idx += uint(dot(hitdir, vec3(1,2,4)));

         vec3 _tmax = mix(tmin, tmax, vec3(1)+hitdir);
         tmin = mix(tmin, tmax, hitdir);
         tmax = _tmax;

      } else { // is branch: get child
         if (stacklen > MAX_DEPTH)
            return vec4(0,0,0,1);
         stack[stacklen++] = idx;
         idx = get_child(tmin, tmax, pos, data>>1u);
      }
   }

   if (i == MAX_ITER) return vec4(0);
   return color;
}

void main() {
   vec2 uv = v_pos.xy;
   uv.x /= u_dim;

   bool in_cross = (abs(uv.x) < .005 && abs(uv.y) < .04) || (abs(uv.x) < .04 && abs(uv.y) < .005);

   Ray ray = Ray(vec3(u_cam * vec4(0,0,0,1)), normalize(vec3(u_cam * vec4(uv,1,0))));

   fragColor = vec4(130, 172, 255, 255)/ 255.;

   fragColor.rgb *= clamp(1.2 - ray.dir.y*.5, 1., 2.);

   vec4 octree_color = trace_octree(ray, fragColor);

   fragColor = overlay(octree_color, fragColor);

   if (in_cross) flip_color();
}
`
