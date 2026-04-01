tag @s add has_sound

execute if data entity @s {variant:"nice_mob_variants:creaking"} run return run data modify entity @s sound_variant set value "nice_mob_variants:creaking"

execute store result score $wolf_sound nice_mob_variants.technical run random value 1..7
execute if score $wolf_sound nice_mob_variants.technical matches 1 run return run data modify entity @s sound_variant set value "minecraft:angry"
execute if score $wolf_sound nice_mob_variants.technical matches 2 run return run data modify entity @s sound_variant set value "minecraft:big"
execute if score $wolf_sound nice_mob_variants.technical matches 3 run return run data modify entity @s sound_variant set value "minecraft:classic"
execute if score $wolf_sound nice_mob_variants.technical matches 4 run return run data modify entity @s sound_variant set value "minecraft:cute"
execute if score $wolf_sound nice_mob_variants.technical matches 5 run return run data modify entity @s sound_variant set value "minecraft:grumpy"
execute if score $wolf_sound nice_mob_variants.technical matches 6 run return run data modify entity @s sound_variant set value "minecraft:puglin"
execute if score $wolf_sound nice_mob_variants.technical matches 7 run return run data modify entity @s sound_variant set value "minecraft:sad"