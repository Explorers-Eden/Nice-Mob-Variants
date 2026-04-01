tag @s add has_sound

execute if data entity @s {variant:"nice_mob_variants:creeper"} run return run data modify entity @s sound_variant set value "nice_mob_variants:creeper"

execute store result score $cat_sound nice_mob_variants.technical run random value 1..3
execute unless score $cat_sound nice_mob_variants.technical matches 3 run return run data modify entity @s sound_variant set value "minecraft:classic"
execute if score $cat_sound nice_mob_variants.technical matches 3 run return run data modify entity @s sound_variant set value "minecraft:royal"