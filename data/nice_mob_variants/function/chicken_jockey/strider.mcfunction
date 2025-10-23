execute if data entity @s {variant:"nice_mob_variants:skeleton"} run return run tag @s add is_jockey

data modify entity @s variant set value "nice_mob_variants:strider"
effect give @s minecraft:fire_resistance infinite 255 true
attribute @s minecraft:burning_time base set 0
tag @s add is_jockey