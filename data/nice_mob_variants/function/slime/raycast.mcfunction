execute as @n[type=#nice_mob_variants:can_become_slime_variant,tag=!nice_mob_variants.is_slime,dx=0,dy=0,dz=0,limit=1] \
  if data entity @s {CollarColor:5b} \
    run tag @s add nice_mob_variants.raycast_slime_target

execute \
  unless entity @e[type=#nice_mob_variants:can_become_slime_variant,tag=nice_mob_variants.raycast_slime_target,tag=!nice_mob_variants.is_slime] \
  positioned ^ ^ ^0.1 \
  if entity @a[tag=nice_mob_variants.raycast_slime,distance=..10] \
    run function nice_mob_variants:slime/raycast