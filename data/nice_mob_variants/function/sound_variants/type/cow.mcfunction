tag @s add has_sound

execute if data entity @s {variant:"nice_mob_variants:sniffer"} run return run data modify entity @s sound_variant set value "nice_mob_variants:sniffer"
execute if data entity @s {variant:"nice_mob_variants:ender"} run return run data modify entity @s sound_variant set value "nice_mob_variants:ender"
execute if data entity @s {variant:"nice_mob_variants:skeleton"} run return run data modify entity @s sound_variant set value "nice_mob_variants:skeleton"

execute store result score $cow_sound nice_mob_variants.technical run random value 1..3
execute unless score $cow_sound nice_mob_variants.technical matches 3 run return run data modify entity @s sound_variant set value "minecraft:classic"
execute if score $cow_sound nice_mob_variants.technical matches 3 run return run data modify entity @s sound_variant set value "minecraft:moody"