data modify entity @s variant set value "nice_mob_variants:slime"
data modify entity @s sound_variant set value "nice_mob_variants:slime"

attribute @s minecraft:bounciness base set 2
attribute @s minecraft:air_drag_modifier base set 0.5

particle minecraft:item_slime ~ ~.5 ~ 0 0.5 0 0 10
tag @s add nice_mob_variants.is_slime
