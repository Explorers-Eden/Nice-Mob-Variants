attribute @s minecraft:gravity modifier add balloon_gravity -0.1 add_value
$attribute @s minecraft:scale base set $(balloon_scale)
effect give @s minecraft:invisibility infinite 1 true
tag @s add nmv.is_balloon
$say $(balloon_scale)